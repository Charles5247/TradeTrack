// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { getDB, type SyncQueueRecord } from '@/lib/offline/db';
import { createClient } from '@/lib/supabase/client';
import { saveWarehouse, syncWarehouseInsert, WarehouseCreateRejected } from './save-warehouse';

const network = vi.hoisted(() => ({
  offline: false,
  insert: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock('@/lib/utils/network', () => ({ isOffline: () => network.offline }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      insert: network.insert,
      select: () => ({
        eq: (idColumn: string, id: string) => ({
          eq: (orgColumn: string, orgId: string) => ({
            maybeSingle: () => network.lookup({ [idColumn]: id, [orgColumn]: orgId }),
          }),
        }),
      }),
    }),
  }),
}));

const fields = { name: 'Main Shop', description: '', address: '', is_main: true };
const save = { id: 'warehouse', organizationId: 'org', data: fields };
const serverRow = { id: save.id, organization_id: save.organizationId, ...fields };
const duplicate = { error: { code: '23505', message: 'Unique violation' } };

beforeEach(async () => {
  network.offline = false;
  network.insert.mockReset();
  network.lookup.mockReset();
  const db = await getDB();
  await db.clear('warehouses');
  await db.clear('sync_queue');
});

it('saves one location and one insert together when offline', async () => {
  network.offline = true;
  await expect(saveWarehouse({ ...save, data: { ...fields, name: '  Main Shop  ' } })).resolves.toBe('pending');
  await expect(saveWarehouse(save)).resolves.toBe('pending');
  await expect(saveWarehouse({ ...save, data: { ...fields, name: 'Different Shop' } })).rejects.toThrow('different details');

  const db = await getDB();
  expect(await db.getAll('warehouses')).toMatchObject([serverRow]);
  expect(await db.getAll('sync_queue')).toMatchObject([{
    table_name: 'warehouses', record_id: save.id, operation: 'INSERT', status: 'pending', payload: serverRow,
  }]);
  expect(network.insert).not.toHaveBeenCalled();
});

it('confirms the same insert when reconnecting after its server acknowledgement was lost', async () => {
  network.insert.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(saveWarehouse(save)).resolves.toBe('pending');
  const db = await getDB();
  const [queued] = await db.getAll('sync_queue') as SyncQueueRecord[];

  network.insert.mockResolvedValue(duplicate);
  network.lookup.mockResolvedValue({ data: serverRow, error: null });
  await expect(syncWarehouseInsert(createClient(), queued)).resolves.toBeUndefined();
  await expect(saveWarehouse(save)).resolves.toBe('confirmed');
  expect(network.lookup).toHaveBeenCalledWith({ id: save.id, organization_id: save.organizationId });
  expect(network.insert.mock.calls.map(([payload]) => payload.id)).toEqual([save.id, save.id, save.id]);
});

it('preserves a location edited on the server after the original insert', async () => {
  network.offline = true;
  await saveWarehouse(save);
  const [queued] = await (await getDB()).getAll('sync_queue') as SyncQueueRecord[];

  network.offline = false;
  network.insert.mockResolvedValue(duplicate);
  network.lookup.mockResolvedValue({ data: { ...serverRow, name: 'Edited elsewhere' }, error: null });
  await expect(syncWarehouseInsert(createClient(), queued)).rejects.toThrow('could not be confirmed');
  await expect(saveWarehouse(save)).rejects.toThrow('could not be confirmed');
  expect(network.insert).toHaveBeenCalledTimes(2);
});

it('does not treat another business’s unseen collision as success or a pending save', async () => {
  network.insert.mockResolvedValueOnce(duplicate);
  network.lookup.mockResolvedValueOnce({ data: null, error: null });
  await expect(saveWarehouse(save)).rejects.toThrow('could not be confirmed');
  expect(network.lookup).toHaveBeenCalledWith({ id: save.id, organization_id: save.organizationId });
  expect(await (await getDB()).getAll('sync_queue')).toHaveLength(0);
});

it('distinguishes a definite insert rejection from an uncertain duplicate lookup', async () => {
  const permissionError = { code: '42501', message: 'Location create is not permitted' };
  network.insert.mockResolvedValueOnce({ error: permissionError }).mockResolvedValueOnce(duplicate);
  network.lookup.mockResolvedValueOnce({ data: null, error: permissionError });

  await expect(saveWarehouse(save)).rejects.toBeInstanceOf(WarehouseCreateRejected);
  await expect(saveWarehouse(save)).rejects.not.toBeInstanceOf(WarehouseCreateRejected);
  expect(await (await getDB()).getAll('sync_queue')).toHaveLength(0);
});

it('keeps manual offline edits on the existing timestamp-aware update path', async () => {
  network.offline = true;
  const existing = { ...serverRow, created_at: '2026-11-20T09:00:00Z', updated_at: '2026-11-20T09:00:00Z' };
  await expect(saveWarehouse({ ...save, existing, data: { ...fields, name: 'New Name' } })).resolves.toBe('pending');
  expect(await (await getDB()).getAll('sync_queue')).toMatchObject([{
    operation: 'UPDATE', record_id: save.id, payload: { ...serverRow, name: 'New Name' },
  }]);
  expect(network.insert).not.toHaveBeenCalled();
});
