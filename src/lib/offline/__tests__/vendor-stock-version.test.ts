// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getDB, pruneSyncedQueueItems, type SyncQueueRecord } from '../db';
import { persistOfflineVendorTransaction, getVendorStockChecks } from '../vendor-transactions';
const { client } = vi.hoisted(() => ({ client: { from: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }));
import { syncEngine } from '../sync-engine';
const engine = syncEngine as unknown as { pushChanges(): Promise<void>; pullData(org: string, client: unknown): Promise<void> };
const initial = '2026-09-25T12:00:00.123456+00:00';
const committed = '2026-09-25T12:00:01.987654+00:00';
const payload = { organization_id: 'org', created_by: 'user', vendor_name: 'Vendor', date_issued: '2026-09-25',
  items: [{ product_id: 'product', quantity: '3', unit_price: '10' }] };
let server: { quantity: number; updated_at: string };
let sent: { quantity: number; expected: string }[];
let beforeCommit: (() => Promise<void>) | undefined;
let loseResponse: boolean;

beforeEach(async () => {
  vi.clearAllMocks();
  server = { quantity: 20, updated_at: initial }; sent = []; beforeCommit = undefined; loseResponse = false;
  const db = await getDB();
  for (const store of ['warehouses', 'products', 'inventory', 'sync_queue', 'vendor_transactions', 'vendor_transaction_items', 'sales']) await db.clear(store);
  await db.put('warehouses', { id: 'warehouse', organization_id: 'org', name: 'Main' });
  await db.put('products', { id: 'product', organization_id: 'org', name: 'Rice' });
  await db.put('inventory', { id: 'stock', organization_id: 'org', product_id: 'product', warehouse_id: 'warehouse', quantity: 20, updated_at: initial });
  client.from.mockImplementation((table: string) => {
    if (table !== 'inventory') return { upsert: async () => ({ error: null }) };
    return { update: (patch: { quantity: number }) => {
      expect(Object.keys(patch)).toEqual(['quantity']);
      const filters: Record<string, unknown> = {};
      const query = { eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        select: async () => {
          sent.push({ quantity: patch.quantity, expected: String(filters.updated_at) });
          expect(filters).toMatchObject({ id: 'stock', organization_id: 'org' });
          const callback = beforeCommit; beforeCommit = undefined;
          await callback?.();
          if (filters.updated_at !== server.updated_at) return { data: [], error: null };
          server = { quantity: patch.quantity, updated_at: sent.length === 1 ? committed : '2026-09-25T12:00:02.654321+00:00' };
          if (loseResponse) throw new TypeError('Connection closed after commit');
          return { data: [{ updated_at: server.updated_at }], error: null };
        } };
      return query;
    } };
  });
});
afterEach(() => vi.restoreAllMocks());
async function stockQueue() {
  return await (await getDB()).getAllFromIndex('sync_queue', 'by-queue-key', ['inventory', 'stock', 'UPDATE']) as SyncQueueRecord[];
}

it('sends 20 → 17 → 14 using the exact raw server version from its predecessor', async () => {
  await persistOfflineVendorTransaction(payload);
  beforeCommit = async () => { await persistOfflineVendorTransaction(payload); };
  await engine.pushChanges();
  await engine.pushChanges();
  expect(server.quantity).toBe(14);
  expect(sent).toEqual([{ quantity: 17, expected: initial }, { quantity: 14, expected: committed }]);
  expect((await stockQueue()).every((entry) => entry.status === 'synced')).toBe(true);
});

it('refreshes pending quantity without changing its original expected version', async () => {
  await persistOfflineVendorTransaction(payload);
  await persistOfflineVendorTransaction(payload);
  expect(await stockQueue()).toHaveLength(1);
  expect((await stockQueue())[0].stock_sync?.expected_version).toBe(initial);
  await engine.pushChanges();
  expect(sent).toEqual([{ quantity: 14, expected: initial }]);
});

it('does not modify an in-flight entry when adding its successor', async () => {
  await persistOfflineVendorTransaction(payload);
  beforeCommit = async () => {
    const [first] = await stockQueue();
    expect(first.status).toBe('syncing');
    await persistOfflineVendorTransaction(payload);
    expect(await (await getDB()).get('sync_queue', first.id)).toEqual(first);
    const successor = (await stockQueue()).find((entry) => entry.id !== first.id)!;
    expect(successor.stock_sync?.predecessor_id).toBe(first.id);
  };
  await engine.pushChanges();
});

it('retains a real concurrent edit for review without burning retries or claiming success', async () => {
  await persistOfflineVendorTransaction(payload);
  beforeCommit = async () => { server = { quantity: 9, updated_at: '2026-09-25T12:00:01.111111+00:00' }; };
  await engine.pushChanges();
  await engine.pushChanges();
  expect(server.quantity).toBe(9);
  expect(sent).toHaveLength(1);
  expect((await stockQueue())[0]).toMatchObject({ status: 'pending', retry_count: 0,
    stock_sync: { review_reason: 'server_stock_changed' } });
  expect(await getVendorStockChecks('org')).toMatchObject([{ productName: 'Rice', savedQuantity: 17 }]);
  expect(await getVendorStockChecks('other')).toEqual([]);
});

it('does not guess completion or retry when the server commits but the response is lost', async () => {
  await persistOfflineVendorTransaction(payload);
  loseResponse = true;
  await engine.pushChanges(); await engine.pushChanges();
  expect(server.quantity).toBe(17);
  expect(sent).toHaveLength(1);
  expect((await stockQueue())[0]).toMatchObject({ status: 'pending', stock_sync: { review_reason: 'write_not_confirmed' } });
});

it('holds an interrupted in-flight record on restart instead of resending it', async () => {
  await persistOfflineVendorTransaction(payload);
  const db = await getDB(); const [entry] = await stockQueue();
  await db.put('sync_queue', { ...entry, status: 'syncing' });
  const RestartedEngine = syncEngine!.constructor as new () => typeof engine;
  await new RestartedEngine().pushChanges();
  expect(sent).toHaveLength(0);
  expect((await stockQueue())[0]).toMatchObject({ status: 'pending', stock_sync: { review_reason: 'interrupted_write' } });
});

it('transfers the confirmed raw version before pruning a predecessor and syncs the persisted successor', async () => {
  await persistOfflineVendorTransaction(payload);
  const db = await getDB(); const [first] = await stockQueue();
  await db.put('sync_queue', { ...first, status: 'syncing' });
  await persistOfflineVendorTransaction(payload);
  await db.put('sync_queue', { ...first, status: 'synced', synced_at: '2020-01-01T00:00:00Z',
    stock_sync: { ...first.stock_sync, confirmed_version: committed } });
  expect(await pruneSyncedQueueItems()).toBe(1);
  expect(await db.get('sync_queue', first.id)).toBeUndefined();
  const [successor] = await stockQueue();
  expect(successor.stock_sync).toMatchObject({ expected_version: committed });
  expect(successor.stock_sync?.predecessor_id).toBeUndefined();
  server = { quantity: 17, updated_at: committed };
  await engine.pushChanges();
  expect(sent).toEqual([{ quantity: 14, expected: committed }]);
});

it('protects unresolved local stock from pulls', async () => {
  await persistOfflineVendorTransaction(payload);
  server.updated_at = committed;
  await engine.pushChanges();
  const remote = { from: (table: string) => {
    const response = { data: table === 'inventory' ? [{ id: 'stock', quantity: 9, updated_at: committed }] : [], error: null };
    const query = { select: () => query, eq: () => query, gte: () => query, like: () => query, is: () => query,
      order: () => query, range: async () => response,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve) };
    return query;
  } };
  await engine.pullData('org', remote);
  expect((await (await getDB()).get('inventory', 'stock')).quantity).toBe(17);
});

it('retains a predecessor with no confirmed version when a successor still depends on it', async () => {
  await persistOfflineVendorTransaction(payload);
  const db = await getDB(); const [first] = await stockQueue();
  await db.put('sync_queue', { ...first, status: 'syncing' });
  await persistOfflineVendorTransaction(payload);
  await db.put('sync_queue', { ...first, status: 'synced', synced_at: '2020-01-01T00:00:00Z' });
  expect(await pruneSyncedQueueItems()).toBe(0);
  expect(await db.get('sync_queue', first.id)).toBeDefined();
  await engine.pushChanges();
  expect((await stockQueue()).find((entry) => entry.id !== first.id)?.stock_sync?.review_reason).toBe('predecessor_needs_check');
});

it('holds a legacy pending snapshot for review rather than inventing its original server version', async () => {
  const db = await getDB();
  await db.put('sync_queue', { id: 'legacy', table_name: 'inventory', record_id: 'stock', operation: 'UPDATE',
    status: 'pending', retry_count: 0, payload: { quantity: 20 }, created_at: initial });
  await persistOfflineVendorTransaction(payload);
  await engine.pushChanges();
  expect(sent).toHaveLength(0);
  expect((await stockQueue())[0]).toMatchObject({ stock_sync: { review_reason: 'legacy_pending_write' } });
});
