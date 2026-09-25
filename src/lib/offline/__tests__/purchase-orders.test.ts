// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { getDB, type SyncQueueRecord } from '../db';
import * as offlineDB from '../db';
import { getOfflinePurchaseOrders, persistOfflinePurchaseOrder, requireSyncedPurchaseOrder } from '../purchase-orders';

const { client } = vi.hoisted(() => ({ client: { from: vi.fn() } }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }));
import { syncEngine } from '../sync-engine';

const payload = {
  organization_id: 'org-1', supplier_id: 'supplier-1', created_by: 'user-1',
  expected_date: null, notes: 'Test draft',
  items: [{ product_id: 'product-1', quantity: '3', unit_cost: '120' }],
};
const engine = syncEngine as unknown as {
  pushChanges(): Promise<void>;
  executeSyncOperation(client: unknown, item: SyncQueueRecord): Promise<unknown>;
  pullPurchaseOrders(org: string, client: unknown): Promise<void>;
};

beforeEach(async () => {
  const db = await getDB();
  for (const store of ['purchase_orders', 'purchase_order_items', 'suppliers', 'products', 'inventory', 'sync_queue']) await db.clear(store);
  vi.clearAllMocks();
});
afterEach(() => { vi.restoreAllMocks(); onlineManager.setOnline(true); });

describe('Purchase Order drafts', () => {
  it('rolls back the draft, items and queue together when queueing fails', async () => {
    const original = offlineDB.addToSyncQueue;
    vi.spyOn(offlineDB, 'addToSyncQueue').mockImplementation(async (...args) => {
      if (args[0] === 'purchase_order_items') throw new Error('Simulated queue failure');
      return original(...args);
    });
    await expect(persistOfflinePurchaseOrder(payload)).rejects.toThrow('Simulated queue failure');
    const db = await getDB();
    for (const store of ['purchase_orders', 'purchase_order_items', 'sync_queue']) expect(await db.count(store)).toBe(0);
  });

  it('creates normalized drafts and INSERTs without changing stock or creating sales', async () => {
    const db = await getDB();
    await db.put('inventory', { id: 'stock', quantity: 19 });
    const saleCount = await db.count('sales');
    const order = await persistOfflinePurchaseOrder(payload);
    expect(order).toMatchObject({ status: 'draft', total_value: 360 });
    const items = await db.getAll('purchase_order_items');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ purchase_order_id: order.id, quantity_received: 0, quantity_ordered: 3 });
    const queue = await db.getAll('sync_queue');
    expect(queue).toHaveLength(2);
    expect(queue.every((row) => row.operation === 'INSERT' && row.status === 'pending')).toBe(true);
    expect(await db.get('inventory', 'stock')).toEqual({ id: 'stock', quantity: 19 });
    expect(await db.count('sales')).toBe(saleCount);
  });

  it.each(['0', '-1', '2.5', 'NaN', ''])('rejects invalid quantity %s without partial writes', async (quantity) => {
    await expect(persistOfflinePurchaseOrder({ ...payload, items: [{ ...payload.items[0], quantity }] })).rejects.toThrow();
    const db = await getDB();
    expect(await db.count('purchase_orders')).toBe(0);
    expect(await db.count('purchase_order_items')).toBe(0);
    expect(await db.count('sync_queue')).toBe(0);
  });

  it('runs the IndexedDB mutation immediately while React Query is offline', async () => {
    onlineManager.setOnline(false);
    const queryClient = new QueryClient();
    const mutation = queryClient.getMutationCache().build(queryClient, {
      networkMode: 'always', mutationFn: persistOfflinePurchaseOrder,
    });
    await mutation.execute(payload);
    expect(mutation.state.status).toBe('success');
    expect(mutation.state.isPaused).toBe(false);
    queryClient.clear();
  });

  it('rebuilds cached joins, scopes organizations and gates unsynced/offline orders', async () => {
    const db = await getDB();
    const order = await persistOfflinePurchaseOrder(payload);
    await db.put('suppliers', { id: 'supplier-1', organization_id: 'org-1', name: 'Supplier' });
    await db.put('products', { id: 'product-1', name: 'Product' });
    expect(await getOfflinePurchaseOrders('other-org')).toEqual([]);
    const [cached] = await getOfflinePurchaseOrders('org-1');
    expect(cached.supplier?.name).toBe('Supplier');
    expect(cached.items?.[0].product?.name).toBe('Product');
    expect(cached.lifecycleReady).toBe(false);
    await expect(requireSyncedPurchaseOrder(order.id, 'org-1')).rejects.toThrow('sync');
    await db.put('purchase_orders', { ...order, synced: true });
    await expect(requireSyncedPurchaseOrder(order.id, 'org-1')).rejects.toThrow('sync');
    for (const item of await db.getAll('purchase_order_items')) await db.put('purchase_order_items', { ...item, synced: true });
    await expect(requireSyncedPurchaseOrder(order.id, 'org-1')).resolves.toBeUndefined();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(requireSyncedPurchaseOrder(order.id, 'org-1')).rejects.toThrow('Reconnect');
  });
});

describe('Purchase Order sync', () => {
  it('recovers a lost parent response without resetting server status or duplicating items', async () => {
    const order = await persistOfflinePurchaseOrder(payload);
    const server = new Map<string, Record<string, unknown>>();
    let loseResponse = true;
    client.from.mockImplementation((table: string) => ({
      upsert: (row: Record<string, unknown>, options: { ignoreDuplicates?: boolean }) => {
        const key = `${table}:${row.id}`;
        if (!server.has(key) || !options.ignoreDuplicates) server.set(key, { ...row });
        if (table === 'purchase_orders' && loseResponse) {
          loseResponse = false;
          return Promise.resolve({ error: new Error('Response lost after commit') });
        }
        return Promise.resolve({ error: null });
      },
    }));
    await engine.pushChanges();
    server.set(`purchase_orders:${order.id}`, { ...order, status: 'received' });
    await engine.pushChanges();
    await engine.pushChanges();
    expect(server.size).toBe(2);
    expect(server.get(`purchase_orders:${order.id}`)?.status).toBe('received');
    expect((await (await getDB()).getAll('sync_queue')).every((row) => row.status === 'synced')).toBe(true);
  });

  it('paginates catalogs beyond the first page', async () => {
    const ranges: number[] = [];
    client.from.mockImplementation((table: string) => {
      const query = { select: () => query, eq: () => query, order: () => query,
        range: (start: number) => {
          if (table === 'suppliers') ranges.push(start);
          return Promise.resolve({ error: null, data: table !== 'suppliers' ? [] :
            Array.from({ length: start === 0 ? 500 : 1 }, (_, i) => ({ id: `supplier-${start + i}`, organization_id: 'org-1' })) });
        } };
      return query;
    });
    await engine.pullPurchaseOrders('org-1', client);
    expect(ranges).toEqual([0, 500]);
    expect(await (await getDB()).count('suppliers')).toBe(501);
  });

  it('sends parent before children and retries without overwriting server rows', async () => {
    await persistOfflinePurchaseOrder(payload);
    const calls: string[] = [];
    client.from.mockImplementation((table: string) => ({ upsert: (_row: unknown, options: unknown) => {
      calls.push(table);
      expect(options).toEqual({ onConflict: 'id', ignoreDuplicates: true });
      return Promise.resolve({ error: null });
    } }));
    await engine.pushChanges();
    expect(calls).toEqual(['purchase_orders', 'purchase_order_items']);
    const db = await getDB();
    expect((await db.getAll('sync_queue')).every((row) => row.status === 'synced')).toBe(true);
    await engine.pushChanges();
    expect(calls).toHaveLength(2);
  });

  it('does not burn child retries when the parent fails', async () => {
    await persistOfflinePurchaseOrder(payload);
    client.from.mockReturnValue({ upsert: () => Promise.resolve({ error: new Error('network failure') }) });
    await engine.pushChanges();
    const rows = await (await getDB()).getAll('sync_queue');
    expect(rows.find((row) => row.table_name === 'purchase_orders').retry_count).toBe(1);
    expect(rows.find((row) => row.table_name === 'purchase_order_items').retry_count).toBe(0);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it.each(['purchase_orders', 'purchase_order_items', 'sales', 'sale_items'])('blocks UPDATE of %s', async (table_name) => {
    await engine.executeSyncOperation(client, { table_name, operation: 'UPDATE', payload: {} } as SyncQueueRecord);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('pulls scoped normalized records but preserves pending local drafts', async () => {
    const order = await persistOfflinePurchaseOrder(payload);
    const filterCalls: unknown[] = [];
    client.from.mockImplementation((table: string) => {
      const data = table === 'purchase_orders' ? [{ ...order, notes: 'server copy' }, { ...order, id: 'remote-order' }]
        : table === 'purchase_order_items' ? [{ id: 'remote-item', purchase_order_id: 'remote-order', purchase_orders: { organization_id: 'org-1' } }]
        : [{ id: 'supplier-1', organization_id: 'org-1', name: 'Supplier' }];
      const query = { select: () => query, eq: (...args: unknown[]) => { filterCalls.push(args); return query; }, order: () => query,
        range: () => Promise.resolve({ data, error: null }) };
      return query;
    });
    await engine.pullPurchaseOrders('org-1', client);
    const db = await getDB();
    expect((await db.get('purchase_orders', order.id)).notes).toBe('Test draft');
    expect((await db.get('purchase_orders', 'remote-order')).synced).toBe(true);
    expect(await db.get('purchase_order_items', 'remote-item')).not.toHaveProperty('purchase_orders');
    expect(filterCalls).toContainEqual(['purchase_orders.organization_id', 'org-1']);
  });
});
