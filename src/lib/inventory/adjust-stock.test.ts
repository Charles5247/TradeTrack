// @vitest-environment jsdom
import '../offline/__tests__/subscription-fixture';
import { beforeEach, expect, it, vi } from 'vitest';
import { getDB } from '@/lib/offline/db';
import { adjustProductStock } from './adjust-stock';

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const db = await getDB();
  await db.clear('inventory');
  await db.clear('sync_queue');
  await db.put('inventory', { id: 'stock', organization_id: 'org', product_id: 'product', warehouse_id: 'warehouse', quantity: 20, min_stock_level: 5 });
});

it('records an offline product-page adjustment in stock, movement and audit queues', async () => {
  const result = await adjustProductStock({
    organization_id: 'org', user_id: 'owner', product_id: 'product', warehouse_id: 'warehouse',
    inventory_id: 'stock', current_quantity: 20, quantity_change: -3, reason: 'Damaged pack',
  });
  expect(result).toEqual({ offline: true, quantity: 17 });
  const db = await getDB();
  expect((await db.get('inventory', 'stock')).quantity).toBe(17);
  const queued = await db.getAll('sync_queue');
  expect(queued.map(row => row.table_name).sort()).toEqual(['audit_logs', 'inventory', 'inventory_movements']);
  expect(queued.find(row => row.table_name === 'inventory_movements')?.payload).toMatchObject({ quantity: -3, movement_type: 'adjustment', notes: 'Damaged pack', created_by: 'owner' });
});

it('requires a reason and never reduces stock below zero', async () => {
  const base = { organization_id: 'org', user_id: 'owner', product_id: 'product', warehouse_id: 'warehouse', current_quantity: 20 };
  await expect(adjustProductStock({ ...base, quantity_change: 1, reason: ' ' })).rejects.toThrow('reason');
  await expect(adjustProductStock({ ...base, quantity_change: -21, reason: 'Count correction' })).rejects.toThrow('below zero');
});
