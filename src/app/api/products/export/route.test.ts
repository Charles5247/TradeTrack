import { beforeEach, describe, expect, it, vi } from 'vitest';

const context = vi.hoisted(() => ({ apiContext: vi.fn() }));
vi.mock('@/lib/auth/api-context', () => context);

import { GET } from './route';

function query(result: unknown) {
  const q = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), in: vi.fn(),
    then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); },
  };
  for (const method of ['select', 'eq', 'order', 'range', 'in'] as const) q[method].mockReturnValue(q);
  return q;
}

describe('product CSV export', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restricts an admin export to assigned warehouses', async () => {
    const assignments = query({ data: [{ warehouse_id: 'warehouse-1' }], error: null });
    const products = query({ data: [{ name: 'Rice', sku: 'R1', selling_price: 10, cost_price: 5,
      inventory: [{ quantity: 3, warehouse: { name: 'Lagos' } }] }], error: null });
    const db = { from: vi.fn((table: string) => table === 'warehouse_staff' ? assignments : products) };
    context.apiContext.mockResolvedValue({ db, org: 'org-1', profile: { role: 'admin', id: 'staff-1' } });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(assignments.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(assignments.eq).toHaveBeenCalledWith('user_id', 'staff-1');
    expect(products.eq).toHaveBeenCalledWith('organization_id', 'org-1');
    expect(products.in).toHaveBeenCalledWith('inventory.warehouse_id', ['warehouse-1']);
    expect(await response.text()).toContain('"Rice"');
    expect(response.headers.get('Content-Disposition')).toContain('.csv');
  });

  it('does not query products when an admin has no warehouse assignment', async () => {
    const assignments = query({ data: [], error: null });
    const db = { from: vi.fn(() => assignments) };
    context.apiContext.mockResolvedValue({ db, org: 'org-1', profile: { role: 'admin', id: 'staff-1' } });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(await response.text()).not.toContain('Rice');
  });

  it('rejects a caller without the required role', async () => {
    context.apiContext.mockRejectedValue(new Error('Permission denied'));
    expect((await GET()).status).toBe(403);
  });
});
