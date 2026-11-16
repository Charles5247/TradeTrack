import { expect, it } from 'vitest';
import { matchInvoiceToOrder } from '../purchase-order-match';

const lines = [{ id: 'l1', product_id: 'p1', quantity_ordered: 5, quantity_received: 0,
  unit_cost: 100, product: { name: 'Peak Milk', sku: 'PEAK', stock_unit: 'carton' } }];

it('shows short shipment and cost increase without changing order data', () => {
  const result = matchInvoiceToOrder([{ name: 'Peak Milk', sku: 'PEAK', opening_stock: '4', cost_price: '120' }], lines);
  expect(result.matched[0]).toMatchObject({ lineId: 'l1', remaining: 5, costDifference: 20 });
  expect(result.short).toEqual([{ name: 'Peak Milk', remaining: 5, onInvoice: 4 }]);
  expect(result.invoiceValue).toBe(480);
  expect(lines[0].quantity_received).toBe(0);
});

it('holds unordered, duplicate and over-delivered rows for review', () => {
  const result = matchInvoiceToOrder([
    { name: 'Peak Milk', sku: 'PEAK', opening_stock: '6', cost_price: '100' },
    { name: 'Peak Milk', sku: 'PEAK', opening_stock: '1', cost_price: '100' },
    { name: 'Unknown', sku: 'X', opening_stock: '1', cost_price: '10' },
  ], lines);
  expect(result.ready).toBe(false);
  expect(result.matched[0].issues).toContain('Invoice quantity exceeds the unreceived order quantity.');
  expect(result.matched[1].issues).toContain('This PO line appears more than once on the invoice.');
  expect(result.matched[2].lineId).toBeNull();
});
