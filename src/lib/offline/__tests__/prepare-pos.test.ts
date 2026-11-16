import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ createClient: vi.fn(), visible: vi.fn(), getDB: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: mock.createClient }));
vi.mock('@/lib/warehouses/staff-visibility', () => ({ visibleWarehouseIds: mock.visible }));
vi.mock('@/lib/offline/db', () => ({ getDB: mock.getDB, saveToOfflineDB: mock.save }));
import { prepareOfflinePos } from '../prepare-pos';

function query(data: unknown[]) {
  const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), in: vi.fn(), range: vi.fn(),
    then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data, error: null }).then(resolve); } };
  for (const key of ['select', 'eq', 'order', 'in', 'range'] as const) q[key].mockReturnValue(q);
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.visible.mockResolvedValue(new Set(['w1']));
  mock.getDB.mockResolvedValue({ getAll: async () => [{ table_name: 'inventory', record_id: 'local-i', status: 'pending',
    payload: { product_id: 'p1', warehouse_id: 'w1' } }] });
});

it('downloads only assigned POS data and preserves pending local stock', async () => {
  const tables = {
    warehouses: query([{ id: 'w1', organization_id: 'org' }]),
    categories: query([{ id: 'c1', organization_id: 'org' }]),
    inventory: query([{ id: 'server-i', product_id: 'p1', warehouse_id: 'w1', quantity: 2 }]),
    products: query([{ id: 'p1', name: 'Rice' }]),
  };
  mock.createClient.mockReturnValue({ from: (table: keyof typeof tables) => tables[table] });
  const result = await prepareOfflinePos({ id: 'staff', organization_id: 'org', role: 'cashier' });
  expect(result).toEqual({ warehouses: 1, products: 1 });
  expect(tables.warehouses.in).toHaveBeenCalledWith('id', ['w1']);
  expect(tables.inventory.in).toHaveBeenCalledWith('warehouse_id', ['w1']);
  expect(tables.products.in).toHaveBeenCalledWith('id', ['p1']);
  expect(mock.save).toHaveBeenCalledWith('inventory', []);
  expect(mock.save).toHaveBeenCalledWith('products', [{ id: 'p1', name: 'Rice' }]);
});
