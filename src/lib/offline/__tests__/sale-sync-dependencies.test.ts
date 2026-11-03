// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { getDB, type SyncQueueRecord } from '../db';

const { upsert, from } = vi.hoisted(() => ({
  upsert: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from }) }));
import { syncEngine } from '../sync-engine';

beforeEach(async () => {
  vi.clearAllMocks();
  const db = await getDB();
  await db.clear('sync_queue');
  from.mockReturnValue({ upsert });
  upsert.mockResolvedValue({ error: { message: 'sale column missing' } });
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
