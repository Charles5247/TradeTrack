// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { getDB, type SyncQueueRecord } from '../db';
import { persistOfflineVendorTransaction } from '../vendor-transactions';
const { client } = vi.hoisted(() => ({ client: { from: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }));
import { syncEngine } from '../sync-engine';
const engine = syncEngine as unknown as {
  pushChanges(): Promise<void>;
  executeSyncOperation(client: unknown, item: SyncQueueRecord): Promise<unknown>;
  pullVendorTransactions(org: string, client: unknown): Promise<void>;
};
const payload = { organization_id: 'org', created_by: 'user', vendor_name: 'Vendor', date_issued: '2026-09-25',
  items: [{ product_id: 'product', quantity: '3', unit_price: '10' }] };
beforeEach(async () => {
  vi.clearAllMocks();
  const db = await getDB();
  for (const store of ['vendor_transactions', 'vendor_transaction_items', 'sales', 'inventory', 'warehouses', 'sync_queue']) await db.clear(store);
  await db.put('warehouses', { id: 'warehouse', organization_id: 'org', name: 'A' });
});

it('sends vendor parents first and does not burn child/sale retries when the parent fails', async () => {
  await persistOfflineVendorTransaction(payload);
  client.from.mockReturnValue({ upsert: () => Promise.resolve({ error: new Error('Offline') }) });
  await engine.pushChanges();
  expect(client.from).toHaveBeenCalledTimes(1);
  expect(client.from).toHaveBeenCalledWith('vendor_transactions');
  const queue = await (await getDB()).getAll('sync_queue');
  expect(queue.filter((row) => row.table_name !== 'vendor_transactions').every((row) => row.retry_count === 0)).toBe(true);
});

it('retries parent and mirrored sale without overwriting server payment state', async () => {
  const vendor = await persistOfflineVendorTransaction(payload);
  const server = new Map<string, Record<string, unknown>>();
  let fail = true;
  client.from.mockImplementation((table: string) => ({ upsert: (row: Record<string, unknown>, options: { ignoreDuplicates?: boolean }) => {
    expect(options.ignoreDuplicates).toBe(true);
    expect(row).not.toHaveProperty('synced');
    const key = `${table}:${row.id}`;
    if (!server.has(key) || !options.ignoreDuplicates) server.set(key, row);
    if (table === 'vendor_transactions' && fail) { fail = false; return { error: new Error('Response lost') }; }
    return { error: null };
  } }));
  await engine.pushChanges();
  server.set(`vendor_transactions:${vendor.id}`, { status: 'completed', amount_paid: 30 });
  await engine.pushChanges();
  expect(server.size).toBe(3);
  expect(server.get(`vendor_transactions:${vendor.id}`)).toMatchObject({ status: 'completed', amount_paid: 30 });
  const db = await getDB();
  const saleQueue = (await db.getAll('sync_queue')).find((row) => row.table_name === 'sales');
  server.set(`sales:${saleQueue.record_id}`, { payment_status: 'paid' });
  await db.put('sync_queue', { ...saleQueue, status: 'pending' });
  await engine.pushChanges();
  expect(server.get(`sales:${saleQueue.record_id}`)).toEqual({ payment_status: 'paid' });
});

it.each(['vendor_transactions', 'vendor_transaction_items'])('blocks UPDATE for %s', async (table_name) => {
  await engine.executeSyncOperation(client, { table_name, operation: 'UPDATE', payload: {} } as SyncQueueRecord);
  expect(client.from).not.toHaveBeenCalled();
});

it('claims the latest pending inventory payload even when refreshed after the flush snapshot', async () => {
  const db = await getDB();
  await db.put('inventory', { id: 'stock', organization_id: 'org', product_id: 'product', warehouse_id: 'warehouse', quantity: 20 });
  await persistOfflineVendorTransaction(payload);
  let refreshed = false;
  const sent: number[] = [];
  client.from.mockImplementation((table: string) => {
    if (table === 'inventory') return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: (row: { quantity: number }) => { sent.push(row.quantity); return { eq: async () => ({ error: null }) }; },
    };
    return { upsert: async () => {
      if (table === 'vendor_transactions' && !refreshed) { refreshed = true; await persistOfflineVendorTransaction(payload); }
      return { error: null };
    } };
  });
  await engine.pushChanges();
  expect(sent).toEqual([14]);
});

it('pulls organization-scoped data and only vendor-linked sales, preserving pending rows', async () => {
  const vendor = await persistOfflineVendorTransaction(payload);
  const calls: unknown[] = [];
  client.from.mockImplementation((table: string) => {
    const query = { select: () => query, eq: (...args: unknown[]) => { calls.push(args); return query; },
      like: (...args: unknown[]) => { calls.push(args); return query; }, is: () => query, order: () => query,
      range: async () => ({ error: null, data: table === 'vendor_transactions' ? [{ ...vendor, vendor_name: 'Server' }, { ...vendor, id: 'remote' }] : [] }) };
    return query;
  });
  await engine.pullVendorTransactions('org', client);
  expect(calls).toContainEqual(['vendor_transactions.organization_id', 'org']);
  expect(calls).toContainEqual(['notes', 'Vendor transaction %']);
  const db = await getDB();
  expect((await db.get('vendor_transactions', vendor.id)).vendor_name).toBe('Vendor');
  expect((await db.get('vendor_transactions', 'remote')).synced).toBe(true);
});

it('applies a successor stock snapshot after an in-flight predecessor commits', async () => {
  const db = await getDB();
  await db.put('inventory', { id: 'stock', organization_id: 'org', product_id: 'product', warehouse_id: 'warehouse', quantity: 20 });
  await persistOfflineVendorTransaction(payload);
  let serverQuantity = 20;
  let serverTimestamp = '1970-01-01T00:00:00Z';
  let createdSuccessor = false;
  client.from.mockImplementation((table: string) => {
    if (table !== 'inventory') return { upsert: async () => ({ error: null }) };
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { updated_at: serverTimestamp }, error: null }) }) }),
      upsert: (row: { quantity: number }) => ({ eq: async () => {
        if (!createdSuccessor) {
          createdSuccessor = true;
          await persistOfflineVendorTransaction(payload);
        }
        serverQuantity = row.quantity;
        // Simulate a server commit after both local writes (network latency).
        serverTimestamp = new Date(Date.now() + 1000).toISOString();
        return { error: null };
      } }),
    };
  });
  await engine.pushChanges();
  await engine.pushChanges();
  expect(serverQuantity).toBe(14);
});
