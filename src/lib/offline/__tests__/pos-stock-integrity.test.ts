// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addToSyncQueue, getDB, type SyncQueueRecord } from '../db';
import { persistOfflineSale, type OfflineSalePayload } from '../sales';

const { client } = vi.hoisted(() => ({ client: { from: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }));
import { syncEngine } from '../sync-engine';

const engine = syncEngine as unknown as { pushChanges(): Promise<void>; pullData(org: string, client: unknown): Promise<void> };
const initialVersion = '2026-10-19T10:00:00.123456+00:00';
const sale: OfflineSalePayload = {
  organization_id: 'org', cashier_id: 'cashier', warehouse_id: 'warehouse', invoice_number: 'LOCAL-1',
  items: [{ product_id: 'product', warehouse_id: 'warehouse', quantity: 1, unit_price: 100, cost_price: 50, discount: 0, total: 100 }],
  subtotal: 100, discount: 0, tax: 0, total: 100, amount_paid: 100, change_amount: 0, payment_method: 'cash',
};
let remote: { quantity: number; updated_at: string };
let loseResponse: boolean;
let denyItems: boolean;
let writes: { quantity: number; version: string }[];

beforeEach(async () => {
  vi.clearAllMocks();
  remote = { quantity: 10, updated_at: initialVersion };
  loseResponse = false; denyItems = false; writes = [];
  const db = await getDB();
  for (const store of ['sales', 'sale_items', 'inventory', 'sync_queue', 'app_meta']) await db.clear(store);
  await db.put('inventory', { id: 'stock', organization_id: 'org', product_id: 'product', warehouse_id: 'warehouse', quantity: 10, updated_at: initialVersion });
  client.from.mockImplementation((table: string) => {
    if (table !== 'inventory') return { upsert: async () => ({ error: table === 'sale_items' && denyItems ? new Error('Item rejected') : null }) };
    const filters: Record<string, unknown> = {};
    const query = {
      select: async () => {
        writes.push({ quantity: patch.quantity, version: String(filters.updated_at) });
        expect(filters).toMatchObject({ id: 'stock', organization_id: 'org' });
        expect(patch.original_device_timestamp).toBeTruthy();
        if (filters.updated_at !== remote.updated_at) return { data: [], error: null };
        remote = { quantity: patch.quantity, updated_at: `2026-10-19T11:00:0${writes.length}.987654+00:00` };
        if (loseResponse) throw new TypeError('Response lost after commit');
        return { data: [{ updated_at: remote.updated_at }], error: null };
      },
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
    };
    let patch: { quantity: number; original_device_timestamp?: string };
    return { update: (value: typeof patch) => { patch = value; return query; } };
  });
});
afterEach(() => vi.restoreAllMocks());

async function stockQueue() {
  return (await getDB()).getAllFromIndex('sync_queue', 'by-queue-key', ['inventory', 'stock', 'UPDATE']) as Promise<SyncQueueRecord[]>;
}

it('retains both consecutive sales and applies their stock snapshots in causal order', async () => {
  const first = await persistOfflineSale(sale);
  const second = await persistOfflineSale({ ...sale, invoice_number: 'LOCAL-2' });
  expect(second.created_at).not.toBe(first.created_at);
  expect(await stockQueue()).toHaveLength(2);
  for (let attempt = 0; attempt < 3; attempt++) await engine.pushChanges();
  expect(remote.quantity).toBe(8);
  expect(writes.map(write => write.quantity)).toEqual([9, 8]);
  expect((await stockQueue()).every(entry => entry.status === 'synced')).toBe(true);
});

it('serializes simultaneous checkouts without losing stock or their outbox records', async () => {
  const receipts = await Promise.all([
    persistOfflineSale(sale),
    persistOfflineSale({ ...sale, invoice_number: 'LOCAL-2' }),
  ]);
  expect(new Set(receipts.map(receipt => receipt.created_at)).size).toBe(2);
  expect((await (await getDB()).get('inventory', 'stock')).quantity).toBe(8);
  expect(await stockQueue()).toHaveLength(2);
  for (let attempt = 0; attempt < 3; attempt++) await engine.pushChanges();
  expect(remote.quantity).toBe(8);
  expect(writes.map(write => write.quantity)).toEqual([9, 8]);
});

it('recovers interrupted idempotent sale inserts and completes their stock effect', async () => {
  await persistOfflineSale(sale);
  const db = await getDB();
  for (const entry of await db.getAll('sync_queue') as SyncQueueRecord[]) {
    if (entry.table_name === 'sales' || entry.table_name === 'sale_items') {
      await db.put('sync_queue', { ...entry, status: 'syncing' });
    }
  }
  await engine.pushChanges();
  expect(remote.quantity).toBe(9);
  expect((await stockQueue())[0].status).toBe('synced');
});

it('preserves every unversioned legacy stock snapshot and holds them for reconciliation', async () => {
  await addToSyncQueue('inventory', 'UPDATE', 'stock', { organization_id: 'org', quantity: 9 });
  await addToSyncQueue('inventory', 'UPDATE', 'stock', { organization_id: 'org', quantity: 8 });
  await engine.pushChanges();
  const entries = await stockQueue();
  expect(entries.map(entry => entry.payload.quantity).sort()).toEqual([8, 9]);
  expect(entries.every(entry => entry.stock_sync?.review_reason === 'legacy_pending_write')).toBe(true);
  expect(writes).toEqual([]);
});

it('rolls back the sale, lines and stock if inserting the outbox fails', async () => {
  const originalAdd = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: IDBObjectStore, value, key) {
    if (this.name === 'sync_queue') throw new DOMException('Outbox unavailable', 'QuotaExceededError');
    return originalAdd.call(this, value, key);
  });
  await expect(persistOfflineSale(sale)).rejects.toThrow('Outbox unavailable');
  const db = await getDB();
  expect(await db.count('sales')).toBe(0);
  expect(await db.count('sale_items')).toBe(0);
  expect((await db.get('inventory', 'stock')).quantity).toBe(10);
  expect(await db.count('sync_queue')).toBe(0);
});

it('does not send a stock write until its sale and every line are confirmed', async () => {
  await persistOfflineSale(sale); denyItems = true;
  await engine.pushChanges();
  expect(writes).toEqual([]);
  expect(remote.quantity).toBe(10);
  expect((await stockQueue())[0].status).toBe('pending');
});

it('preserves concurrent remote stock and holds the local change for review', async () => {
  await persistOfflineSale(sale);
  remote = { quantity: 15, updated_at: '2026-10-19T10:30:00.123456+00:00' };
  await engine.pushChanges(); await engine.pushChanges();
  expect(remote.quantity).toBe(15);
  expect(writes).toHaveLength(1);
  expect((await stockQueue())[0]).toMatchObject({ status: 'pending', stock_sync: { review_reason: 'server_stock_changed' } });
});

it('holds ambiguous response loss instead of replaying a possibly committed stock change', async () => {
  await persistOfflineSale(sale); loseResponse = true;
  await engine.pushChanges(); await engine.pushChanges();
  expect(remote.quantity).toBe(9);
  expect(writes).toHaveLength(1);
  expect((await stockQueue())[0]).toMatchObject({ status: 'pending', stock_sync: { review_reason: 'write_not_confirmed' } });
});

it.each([0, -1, 0.5, 11])('rejects invalid or unavailable quantities without partial local data: %s', async quantity => {
  await expect(persistOfflineSale({ ...sale, items: [{ ...sale.items[0], quantity }] })).rejects.toThrow();
  expect(await (await getDB()).count('sales')).toBe(0);
  expect((await (await getDB()).get('inventory', 'stock')).quantity).toBe(10);
});
