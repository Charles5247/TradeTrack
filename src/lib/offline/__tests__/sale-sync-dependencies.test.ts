// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { getDB, type SyncQueueRecord } from '../db';

const { upsert, from, rpc } = vi.hoisted(() => ({
  upsert: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from, rpc }) }));
import { syncEngine } from '../sync-engine';

beforeEach(async () => {
  vi.clearAllMocks();
  const db = await getDB();
  await db.clear('sync_queue');
  from.mockReturnValue({ upsert });
  upsert.mockResolvedValue({ error: { message: 'sale column missing' } });
  rpc.mockResolvedValue({ error: null });
});

it('applies stock once per sale only after its item upload succeeds', async () => {
  const db = await getDB();
  const timestamp = '2026-11-03T10:00:00.000Z';
  for (const entry of [
    { id: 'q-sale', table_name: 'sales', operation: 'INSERT', record_id: 'sale-1', payload: { id: 'sale-1', created_at: timestamp } },
    { id: 'q-line', table_name: 'sale_items', operation: 'INSERT', record_id: 'line-1', payload: { id: 'line-1', sale_id: 'sale-1' } },
    { id: 'q-stock', table_name: 'sale_stock', operation: 'INSERT', record_id: 'sale-1', payload: { sale_id: 'sale-1', item_ids: ['line-1'] } },
  ] as const) await db.put('sync_queue', { ...entry, status: 'pending', retry_count: 0, created_at: timestamp });

  upsert.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'item rejected' } });
  await (syncEngine as unknown as { pushChanges(): Promise<void> }).pushChanges();
  expect(rpc).not.toHaveBeenCalled();
  expect((await db.get('sync_queue', 'q-stock'))?.status).toBe('pending');

  upsert.mockResolvedValue({ error: null });
  await (syncEngine as unknown as { pushChanges(): Promise<void> }).pushChanges();
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith('apply_sale_stock', { p_sale_id: 'sale-1' });
  expect((await db.get('sync_queue', 'q-stock'))?.status).toBe('synced');
});

it('does not upload sale lines or stock when the parent sale is rejected', async () => {
  const db = await getDB();
  const timestamp = '2026-11-03T10:00:00.000Z';
  const entries: SyncQueueRecord[] = [
    { id: 'q-sale', table_name: 'sales', operation: 'INSERT', record_id: 'sale-1', payload: { id: 'sale-1', created_at: timestamp }, status: 'pending', retry_count: 0, created_at: timestamp },
    { id: 'q-line', table_name: 'sale_items', operation: 'INSERT', record_id: 'line-1', payload: { id: 'line-1', sale_id: 'sale-1' }, status: 'pending', retry_count: 0, created_at: timestamp },
    { id: 'q-stock', table_name: 'inventory', operation: 'UPDATE', record_id: 'stock-1', payload: { id: 'stock-1', updated_at: timestamp }, status: 'pending', retry_count: 0, created_at: timestamp },
  ];
  for (const entry of entries) await db.put('sync_queue', entry);

  await (syncEngine as unknown as { pushChanges(): Promise<void> }).pushChanges();

  expect(from).toHaveBeenCalledTimes(1);
  expect(from).toHaveBeenCalledWith('sales');
  expect((await db.get('sync_queue', 'q-line'))?.status).toBe('pending');
  expect((await db.get('sync_queue', 'q-stock'))?.status).toBe('pending');
});

it('removes reset sale work while preserving unrelated queued changes', async () => {
  const db = await getDB();
  const timestamp = '2026-11-02T19:18:49.967Z';
  await db.put('sales', { id: 'sale-reset', organization_id: 'org-1', created_at: timestamp });
  await db.put('sale_items', { id: 'line-reset', sale_id: 'sale-reset' });
  for (const entry of [
    { id: 'q-sale', table_name: 'sales', record_id: 'sale-reset', payload: { created_at: timestamp } },
    { id: 'q-line', table_name: 'sale_items', record_id: 'line-reset', payload: { sale_id: 'sale-reset' } },
    { id: 'q-stock', table_name: 'inventory', record_id: 'stock-1', payload: { updated_at: timestamp } },
    { id: 'q-other', table_name: 'inventory', record_id: 'stock-2', payload: { updated_at: '2026-11-03T00:00:00Z' } },
  ]) await db.put('sync_queue', { ...entry, operation: 'UPDATE', status: 'failed', retry_count: 3, created_at: timestamp });

  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockResolvedValue({ data: [{ sale_id: 'sale-reset' }], error: null });
  from.mockReturnValue(query);

  const changed = await (syncEngine as unknown as {
    discardResetSales(orgId: string, client: unknown): Promise<boolean>
  }).discardResetSales('org-1', { from });

  expect(changed).toBe(true);
  expect(await db.get('sales', 'sale-reset')).toBeUndefined();
  expect(await db.get('sale_items', 'line-reset')).toBeUndefined();
  for (const id of ['q-sale', 'q-line', 'q-stock']) expect(await db.get('sync_queue', id)).toBeUndefined();
  expect(await db.get('sync_queue', 'q-other')).toBeDefined();
});

it('reconciles a rejected stock update when its synced sale was removed on the server', async () => {
  const db = await getDB();
  const timestamp = '2026-11-02T21:07:58.178Z';
  await db.put('sales', { id: 'deleted-sale', organization_id: 'org-1', created_at: timestamp });
  await db.put('sync_queue', {
    id: 'synced-sale', table_name: 'sales', operation: 'INSERT', record_id: 'deleted-sale',
    payload: { created_at: timestamp }, status: 'synced', retry_count: 0, created_at: timestamp,
  });
  await db.put('sync_queue', {
    id: 'rejected-stock', table_name: 'inventory', operation: 'UPDATE', record_id: 'stock-1',
    payload: { updated_at: timestamp }, status: 'failed', retry_count: 4, created_at: timestamp,
    error: 'Stock change must match an unreconciled cashier sale',
  });
  const tombstones = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
  tombstones.select.mockReturnValue(tombstones);
  tombstones.eq.mockReturnValue(tombstones);
  tombstones.order.mockReturnValue(tombstones);
  tombstones.range.mockResolvedValue({ data: null, error: { code: 'PGRST205' } });
  const salesQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  salesQuery.select.mockReturnValue(salesQuery);
  salesQuery.eq.mockReturnValue(salesQuery);
  salesQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
  from.mockImplementation((table: string) => table === 'sales' ? salesQuery : tombstones);

  const changed = await (syncEngine as unknown as {
    discardResetSales(orgId: string, client: unknown): Promise<boolean>
  }).discardResetSales('org-1', { from });
  expect(changed).toBe(true);
  expect(await db.get('sales', 'deleted-sale')).toBeUndefined();
  expect(await db.get('sync_queue', 'rejected-stock')).toBeUndefined();
});
