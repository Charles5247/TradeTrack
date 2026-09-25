// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { openDB } from 'idb';
vi.mock('../auth-cache', () => ({ getOfflineAccountNamespace: () => 'v4-upgrade-test' }));
import { getDB } from '../db';

it('upgrades a populated v3 database without losing POS rows or queue indexes', async () => {
  const old = await openDB('tradetrack-offline-v4-upgrade-test', 3, {
    upgrade(db) {
      for (const name of ['products', 'inventory', 'sales', 'sale_items', 'warehouses', 'categories', 'pending_receipts', 'user_sessions']) {
        db.createObjectStore(name, { keyPath: 'id' });
      }
      const queue = db.createObjectStore('sync_queue', { keyPath: 'id' });
      queue.createIndex('by-queue-key', ['table_name', 'record_id', 'operation']);
      queue.createIndex('by-status', 'status');
      queue.createIndex('by-table', 'table_name');
    },
  });
  await old.put('sales', { id: 'existing-sale', total: 100 });
  await old.put('sale_items', { id: 'existing-item', sale_id: 'existing-sale' });
  await old.put('sync_queue', { id: 'existing-queue', table_name: 'sales', record_id: 'existing-sale', operation: 'INSERT', status: 'pending' });
  old.close();
  const db = await getDB();
  expect(db.version).toBe(4);
  expect(await db.get('sales', 'existing-sale')).toEqual({ id: 'existing-sale', total: 100 });
  expect(await db.count('sale_items')).toBe(1);
  expect(await db.getAllFromIndex('sync_queue', 'by-queue-key', ['sales', 'existing-sale', 'INSERT'])).toHaveLength(1);
  for (const name of ['suppliers', 'purchase_orders', 'purchase_order_items']) expect(db.objectStoreNames.contains(name)).toBe(true);
  db.close();
});
