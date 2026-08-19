import { getDB, addToSyncQueue } from './db';
import { generateId } from '@/lib/utils/id';

export interface OfflineSaleItemPayload {
  product_id: string;
  warehouse_id: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount: number;
  total: number;
}

export interface OfflineSalePayload {
  cashier_id: string;
  organization_id: string;
  warehouse_id: string;
  invoice_number: string;
  items: OfflineSaleItemPayload[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amount_paid: number;
  change_amount: number;
  payment_method: string;
  notes?: string;
  receipt_url?: string;
}

export async function persistOfflineSale(payload: OfflineSalePayload) {
  const saleId = generateId();
  const createdAt = new Date().toISOString();

  const saleRecord = {
    id: saleId,
    organization_id: payload.organization_id,
    invoice_number: payload.invoice_number,
    cashier_id: payload.cashier_id,
    warehouse_id: payload.warehouse_id,
    subtotal: payload.subtotal,
    discount: payload.discount,
    tax: payload.tax,
    total: payload.total,
    amount_paid: payload.amount_paid,
    change_amount: payload.change_amount,
    payment_method: payload.payment_method,
    payment_status: payload.amount_paid >= payload.total ? 'paid' : 'partial',
    status: 'completed',
    notes: payload.notes ?? null,
    receipt_url: payload.receipt_url ?? null,
    created_at: createdAt,
    updated_at: createdAt,
    synced: false,
  };

  const saleItems = payload.items.map((item) => ({
    id: generateId(),
    sale_id: saleId,
    product_id: item.product_id,
    warehouse_id: item.warehouse_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    cost_price: item.cost_price,
    discount: item.discount,
    total: item.total,
    created_at: createdAt,
  }));

  const db = await getDB();
  const transaction = db.transaction(['sales', 'sale_items', 'inventory'], 'readwrite');
  const inventoryUpdates: Record<string, unknown>[] = [];
  await transaction.objectStore('sales').put(saleRecord);
  for (const item of saleItems) {
    await transaction.objectStore('sale_items').put(item);

    // Apply the stock reduction locally so subsequent offline sales see the
    // correct availability. The update is queued after the transaction.
    const inventory = await transaction.objectStore('inventory').getAll();
    const stock = inventory.find(
      (record: { product_id: string; warehouse_id: string }) =>
        record.product_id === item.product_id &&
        record.warehouse_id === item.warehouse_id,
    ) as Record<string, unknown> | undefined;
    if (stock) {
      const updated = {
        ...stock,
        quantity: Math.max(0, Number(stock.quantity ?? 0) - item.quantity),
        updated_at: createdAt,
      };
      await transaction.objectStore('inventory').put(updated);
      inventoryUpdates.push(updated);
    }
  }
  await transaction.done;
  await addToSyncQueue('sales', 'INSERT', saleId, saleRecord);
  for (const item of saleItems) {
    await addToSyncQueue('sale_items', 'INSERT', item.id, item);
  }
  for (const inventory of inventoryUpdates) {
    await addToSyncQueue('inventory', 'UPDATE', String(inventory.id), inventory);
  }

  return saleRecord;
}
