import { getDB, addToSyncQueue } from './db';
import { requireTransactionSubscription } from '@/lib/subscriptions/verification';
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
  sale_type?: 'retail' | 'b2b' | 'b2c';
  credit_authorized_by?: string;
  notes?: string;
  receipt_url?: string;
  discount_authorized_by?: string;
  discount_request_id?: string;
  discount_reason?: string;
  discount_cart_hash?: string;
  discount_permission_snapshot?: Record<string, unknown>;
}

export async function persistOfflineSale(payload: OfflineSalePayload) {
  await requireTransactionSubscription(payload.organization_id);
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
    payment_status: payload.amount_paid >= payload.total
      ? 'paid'
      : payload.amount_paid > 0
        ? 'partial'
        : 'unpaid',
    sale_type: payload.sale_type ?? 'retail',
    credit_authorized_by: payload.credit_authorized_by ?? null,
    status: 'completed',
    notes: payload.notes ?? null,
    receipt_url: payload.receipt_url ?? null,
    discount_authorized_by: payload.discount_authorized_by ?? null,
    discount_request_id: payload.discount_request_id ?? null,
    discount_reason: payload.discount_reason ?? null,
    discount_cart_hash: payload.discount_cart_hash ?? null,
    discount_permission_snapshot: payload.discount_permission_snapshot ?? null,
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
  const transaction = db.transaction(['sales', 'sale_items', 'inventory', 'sync_queue', 'products'], 'readwrite');
  const done = transaction.done;
  void done.catch(() => {});
  try {
  for (const item of payload.items) {
    const product = await transaction.objectStore('products').get(item.product_id);
    if (product?.medical_stock_managed) throw new Error('Use the medical batch workflow for this product');
  }
  const inventoryUpdates: Record<string, unknown>[] = [];
  await transaction.objectStore('sales').put(saleRecord);

  // Fetch the full inventory list ONCE up front and look up each cart
  // line's matching stock row in memory, instead of re-reading the entire
  // `inventory` store on every single iteration of this loop.
  const inventory = (await transaction.objectStore('inventory').getAll()) as Record<
    string,
    unknown
  >[];
  const inventoryByProductWarehouse = new Map<string, Record<string, unknown>>();
  for (const record of inventory) {
    if (record.organization_id !== payload.organization_id) continue;
    inventoryByProductWarehouse.set(
      `${record.product_id as string}::${record.warehouse_id as string}`,
      record,
    );
  }

  for (const item of saleItems) {
    await transaction.objectStore('sale_items').put(item);

    // Apply the stock reduction locally so subsequent offline sales see the
    // correct availability. The update is queued after the transaction.
    const stock = inventoryByProductWarehouse.get(
      `${item.product_id}::${item.warehouse_id}`,
    );
    if (stock) {
      const updated = {
        ...stock,
        quantity: Math.max(0, Number(stock.quantity ?? 0) - item.quantity),
        updated_at: createdAt,
      };
      await transaction.objectStore('inventory').put(updated);
      inventoryUpdates.push(updated);
      // Keep the in-memory snapshot consistent in case the same
      // product/warehouse appears in more than one cart line.
      inventoryByProductWarehouse.set(
        `${item.product_id}::${item.warehouse_id}`,
        updated,
      );
    }
  }
  // Commit the receipt, stock and outbox atomically. A device interruption
  // or queue write failure cannot leave a sale with no sync record.
  await Promise.all([
    addToSyncQueue('sales', 'INSERT', saleId, saleRecord, transaction),
    ...saleItems.map((item) => addToSyncQueue('sale_items', 'INSERT', item.id, item, transaction)),
  ]);
  // Keep the final snapshot when repeated offline sales touch the same row.
  // Serialize updates so duplicate cart lines cannot race queue coalescing.
  for (const inv of inventoryUpdates) {
    await addToSyncQueue('inventory', 'UPDATE', String(inv.id), inv, transaction, {
      refreshPendingInventoryUpdate: true,
    });
  }
  await done;

  return saleRecord;
  } catch (error) {
    try { transaction.abort(); } catch { /* Already aborted or completed. */ }
    await done.catch(() => {});
    throw error;
  }
}
