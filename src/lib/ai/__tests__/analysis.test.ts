import { expect, it } from 'vitest';
import { periodComparison, recentAnalysis } from '../analysis';
it('uses only the recent window and declines stock forecasts without enough history', () => {
  const result = recentAnalysis([{ id: 'p', name: 'Rice' }], [{ product_id: 'p', quantity: 10 }], [
    { cashier_id: 'u', created_at: '2026-10-14T00:00:00Z', total: 200, sale_items: [{ product_id: 'p', quantity: 2 }] },
    { cashier_id: 'u', created_at: '2026-01-01T00:00:00Z', total: 9999, sale_items: [{ product_id: 'p', quantity: 99 }] },
  ], Date.parse('2026-10-14T12:00:00Z'))!;
  expect(result.saleCount).toBe(1); expect(result.salesTotal).toBe(200);
  expect(result.products[0]).toMatchObject({ unitsSold: 2, stock: 10, estimatedDaysLeft: null });
  expect(result.staff[0]).toMatchObject({ transactions: 1, averageSale: 200 });
});

it('compares non-overlapping periods and flags absent sale items', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const result = periodComparison([{ id: 'p', name: 'Rice' }], [
    { created_at: '2026-11-14T12:00:00Z', total: 120, sale_items: [{ product_id: 'p', quantity: 2, unit_price: 60 }] },
    { created_at: '2026-11-13T12:00:00Z', total: 20, sale_items: [] },
    { created_at: '2026-10-01T12:00:00Z', total: 100, sale_items: [] },
  ], now);
  expect(result.current).toMatchObject({ sales: 2, revenue: 140 });
  expect(result.previous).toMatchObject({ sales: 1, revenue: 100 });
  expect(result.changePercent).toBe(40);
  expect(result.missingItemSales).toBe(1);
  expect(result.topProducts[0]).toEqual({ name: 'Rice', units: 2, revenue: 120 });
});
