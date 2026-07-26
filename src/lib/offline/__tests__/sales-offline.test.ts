// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { persistOfflineSale } from '../sales';
import { getDB } from '../db';

describe('persistOfflineSale', () => {
  beforeEach(async () => {
    const db = await getDB();
    await db.clear('sales');
    await db.clear('sale_items');
    await db.clear('sync_queue');
  });

  it('stores a sale locally and queues it for sync', async () => {
    await persistOfflineSale({
      cashier_id: 'cashier-1',
      organization_id: 'org-1',
      warehouse_id: 'warehouse-1',
      invoice_number: 'INV-000001',
      items: [
        {
          product_id: 'product-1',
          warehouse_id: 'warehouse-1',
          quantity: 1,
          unit_price: 100,
          cost_price: 80,
          discount: 0,
          total: 100,
        },
      ],
      subtotal: 100,
      discount: 0,
      tax: 0,
      total: 100,
      amount_paid: 100,
      change_amount: 0,
      payment_method: 'cash',
      notes: 'offline test',
    });

    const db = await getDB();
    const sales = await db.getAll('sales');
    const saleItems = await db.getAll('sale_items');
    const queueItems = await db.getAll('sync_queue');

    expect(sales).toHaveLength(1);
    expect(saleItems).toHaveLength(1);
    expect(queueItems.some((item) => item.table_name === 'sales')).toBe(true);
  });
});
