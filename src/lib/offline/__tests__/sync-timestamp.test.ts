// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import type { SyncQueueRecord } from '../db';
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
import { syncEngine } from '../sync-engine';

const engine = syncEngine as unknown as {
  executeSyncOperation(client: unknown, item: SyncQueueRecord): Promise<unknown>;
};

it.each([
  ['2026-09-25T12:00:00.123456+00:00', '2026-09-25T12:00:00.123455Z', false],
  ['2026-09-25T12:00:00.123455Z', '2026-09-25T12:00:00.123456+00:00', true],
  ['2026-09-25T12:00:00.123000+00:00', '2026-09-25T12:00:00.123Z', true],
  ['2026-09-25T13:00:00.123456+01:00', '2026-09-25T12:00:00.123456Z', true],
  ['2026-09-25T13:00:00.123457+01:00', '2026-09-25T12:00:00.123456Z', false],
  ['2026-09-25T11:59:59.999999Z', '2026-09-25T12:00:00Z', true],
])('compares full precision %s against %s (write=%s)', async (server, local, write) => {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: { updated_at: server }, error: null })),
    update: vi.fn(() => query),
  };
  await engine.executeSyncOperation({ from: () => query }, {
    id: 'queue', status: 'pending', retry_count: 0, created_at: local,
    table_name: 'inventory', operation: 'UPDATE', record_id: 'stock',
    payload: { id: 'stock', quantity: 3 }, client_updated_at: local,
  } as SyncQueueRecord);
  expect(query.update).toHaveBeenCalledTimes(write ? 1 : 0);
});

it('does not overwrite stock when a version cannot be compared', async () => {
  const query = { select: () => query, eq: () => query,
    maybeSingle: async () => ({ data: { updated_at: 'invalid' }, error: null }), update: vi.fn() };
  await expect(engine.executeSyncOperation({ from: () => query }, {
    id: 'queue', status: 'pending', retry_count: 0, created_at: '2026-09-25T12:00:00Z',
    table_name: 'inventory', operation: 'UPDATE', record_id: 'stock', payload: {},
    client_updated_at: '2026-09-25T12:00:00Z',
  } as SyncQueueRecord)).rejects.toThrow('Invalid sync timestamp');
  expect(query.update).not.toHaveBeenCalled();
});
