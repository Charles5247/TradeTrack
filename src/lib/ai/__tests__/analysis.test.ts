import { expect, it } from 'vitest';
import { recentAnalysis } from '../analysis';
it('uses only the recent window and declines stock forecasts without enough history', () => {
  const result = recentAnalysis([{ id: 'p', name: 'Rice' }], [{ product_id: 'p', quantity: 10 }], [
    { cashier_id: 'u', created_at: '2026-10-14T00:00:00Z', total: 200, sale_items: [{ product_id: 'p', quantity: 2 }] },
    { cashier_id: 'u', created_at: '2026-01-01T00:00:00Z', total: 9999, sale_items: [{ product_id: 'p', quantity: 99 }] },
  ], Date.parse('2026-10-14T12:00:00Z'))!;
  expect(result.saleCount).toBe(1); expect(result.salesTotal).toBe(200);
  expect(result.products[0]).toMatchObject({ unitsSold: 2, stock: 10, estimatedDaysLeft: null });
  expect(result.staff[0]).toMatchObject({ transactions: 1, averageSale: 200 });
});
