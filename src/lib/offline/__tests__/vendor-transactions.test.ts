// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import * as offlineDB from '../db';
import { getDB } from '../db';
import { persistOfflineVendorTransaction, getOfflineVendorTransactions, requireSyncedVendorTransaction } from '../vendor-transactions';

const payload = { organization_id: 'org', created_by: 'user', vendor_name: 'Vendor', vendor_phone: '123',
  date_issued: '2026-09-25', items: [{ product_id: 'product', quantity: '3', unit_price: '10' }] };
beforeEach(async () => {
  const db = await getDB();
  for (const store of ['vendor_transactions', 'vendor_transaction_items', 'sales', 'sale_items', 'inventory', 'warehouses', 'sync_queue']) await db.clear(store);
  await db.put('warehouses', { id: 'a', organization_id: 'org', name: 'A' });
  await db.put('warehouses', { id: 'b', organization_id: 'org', name: 'B' });
  await db.put('inventory', { id: 'stock-a', organization_id: 'org', product_id: 'product', warehouse_id: 'a', quantity: 5 });
  await db.put('inventory', { id: 'stock-b', organization_id: 'org', product_id: 'product', warehouse_id: 'b', quantity: 20 });
});
afterEach(() => { vi.restoreAllMocks(); onlineManager.setOnline(true); });

it('atomically creates vendor, items, mirrored sale and decrements the most-stock warehouse from one read', async () => {
  const read = vi.spyOn(offlineDB, 'getAllFromOfflineDB');
  const vendor = await persistOfflineVendorTransaction(payload);
  expect(read.mock.calls.filter(([store]) => store === 'inventory')).toHaveLength(1);
  const db = await getDB();
  expect(await db.count('vendor_transaction_items')).toBe(1);
  expect(await db.count('sale_items')).toBe(0);
  const [sale] = await db.getAll('sales');
  expect(sale).toMatchObject({ notes: `Vendor transaction ${vendor.id}`, total: 30, amount_paid: 0,
    status: 'pending', payment_status: 'unpaid', customer_name: 'Vendor', customer_phone: '123', warehouse_id: 'a' });
  expect((await db.get('inventory', 'stock-a')).quantity).toBe(5);
  expect((await db.get('inventory', 'stock-b')).quantity).toBe(17);
  const queue = await db.getAll('sync_queue');
  expect(queue).toHaveLength(4);
  expect(queue.filter((row) => row.operation === 'UPDATE').map((row) => row.table_name)).toEqual(['inventory']);
});

it('refreshes the pending inventory payload to the cumulative quantity after two decrements', async () => {
  await persistOfflineVendorTransaction(payload);
  await persistOfflineVendorTransaction(payload);
  const db = await getDB();
  const rows = await db.getAllFromIndex('sync_queue', 'by-queue-key', ['inventory', 'stock-b', 'UPDATE']);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: 'pending', payload: { quantity: 14 } });
  expect((await db.get('inventory', 'stock-b')).quantity).toBe(14);
});

it('preserves an in-flight entry and creates a separate pending latest snapshot', async () => {
  await persistOfflineVendorTransaction(payload);
  const db = await getDB();
  const [first] = await db.getAllFromIndex('sync_queue', 'by-queue-key', ['inventory', 'stock-b', 'UPDATE']);
  const inFlight = { ...first, status: 'syncing' };
  await db.put('sync_queue', inFlight);
  await persistOfflineVendorTransaction(payload);
  expect(await db.get('sync_queue', first.id)).toEqual(inFlight);
  const rows = await db.getAllFromIndex('sync_queue', 'by-queue-key', ['inventory', 'stock-b', 'UPDATE']);
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.status === 'pending')?.payload.quantity).toBe(14);
});

it('serializes simultaneous writers without losing a decrement', async () => {
  await Promise.all([persistOfflineVendorTransaction(payload), persistOfflineVendorTransaction(payload)]);
  expect((await (await getDB()).get('inventory', 'stock-b')).quantity).toBe(14);
});

it('reselects the maximum warehouse for repeated product lines and ignores other organizations', async () => {
  const db = await getDB();
  await db.put('inventory', { id: 'foreign', organization_id: 'other', product_id: 'product', quantity: 500 });
  await persistOfflineVendorTransaction({ ...payload, items: [
    { ...payload.items[0], quantity: '18' }, { ...payload.items[0], quantity: '3' },
  ] });
  expect((await db.get('inventory', 'stock-b')).quantity).toBe(2);
  expect((await db.get('inventory', 'stock-a')).quantity).toBe(2);
  expect((await db.get('inventory', 'foreign')).quantity).toBe(500);
});

it('matches online behavior by leaving insufficient stock unchanged', async () => {
  await persistOfflineVendorTransaction({ ...payload, items: [{ ...payload.items[0], quantity: '21' }] });
  expect((await (await getDB()).get('inventory', 'stock-b')).quantity).toBe(20);
});

it('rolls back every store and stock change when queueing fails', async () => {
  const original = offlineDB.addToSyncQueue;
  vi.spyOn(offlineDB, 'addToSyncQueue').mockImplementation(async (...args) => {
    if (args[0] === 'sales') throw new Error('Queue unavailable');
    return original(...args);
  });
  await expect(persistOfflineVendorTransaction(payload)).rejects.toThrow('Queue unavailable');
  const db = await getDB();
  for (const store of ['vendor_transactions', 'vendor_transaction_items', 'sales', 'sync_queue']) expect(await db.count(store)).toBe(0);
  expect((await db.get('inventory', 'stock-b')).quantity).toBe(20);
});

it.each(['0', '-1', '2.5', 'NaN'])('rejects invalid quantity %s without writes', async (quantity) => {
  await expect(persistOfflineVendorTransaction({ ...payload, items: [{ ...payload.items[0], quantity }] })).rejects.toThrow();
  expect(await (await getDB()).count('vendor_transactions')).toBe(0);
});

it('runs creation immediately with React Query offline', async () => {
  onlineManager.setOnline(false);
  const client = new QueryClient();
  const mutation = client.getMutationCache().build(client, { networkMode: 'always', mutationFn: persistOfflineVendorTransaction });
  await mutation.execute(payload);
  expect(mutation.state).toMatchObject({ status: 'success', isPaused: false });
  client.clear();
});

it('requires the vendor, all items and exact linked sale to sync before payment', async () => {
  const vendor = await persistOfflineVendorTransaction(payload);
  const db = await getDB();
  expect(await getOfflineVendorTransactions('other')).toEqual([]);
  await expect(requireSyncedVendorTransaction(vendor.id, 'org')).rejects.toThrow('sync');
  for (const store of ['vendor_transactions', 'vendor_transaction_items']) {
    for (const row of await db.getAll(store)) await db.put(store, { ...row, synced: true });
  }
  await expect(requireSyncedVendorTransaction(vendor.id, 'org')).rejects.toThrow('linked sale');
  const [sale] = await db.getAll('sales');
  await db.put('sales', { ...sale, synced: true });
  await expect(requireSyncedVendorTransaction(vendor.id, 'org')).resolves.toBeUndefined();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await expect(requireSyncedVendorTransaction(vendor.id, 'org')).rejects.toThrow('Reconnect');
});
