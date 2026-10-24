import { getDB, addToSyncQueue, type InventoryRecord } from './db';
import { generateId } from '@/lib/utils/id';
import { atomicCheckoutEnabled } from './checkout-command';

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
  customer_name?: string;
  customer_phone?: string;
}

export async function persistOfflineSale(payload: OfflineSalePayload) {
  if (!payload.organization_id || !payload.cashier_id || !payload.warehouse_id || !payload.items.length) {
    throw new Error('Business, cashier, location and sale items are required.');
  }
  for (const item of payload.items) {
    if (!item.product_id || item.warehouse_id !== payload.warehouse_id ||
        !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 2147483647) {
      throw new Error('Each sale item requires a valid product, selected location and positive integer quantity.');
    }
  }

  const db = await getDB();
  const transaction = db.transaction(['sales', 'sale_items', 'inventory', 'sync_queue', 'app_meta'], 'readwrite');
  const done = transaction.done;
  void done.catch(() => {});
  try {
    // The existing server guard identifies a sale's stock effect by timestamp.
    // Allocate a distinct timestamp under the same local transaction, including
    // rapid checkouts from different tabs; never combine different sales' stock.
    const previous = await transaction.objectStore('app_meta').get('pos:last_timestamp');
    const previousTime = Number(previous?.timestamp) || 0;
    const timestamp = Math.max(Date.now(), previousTime + 1);
    const createdAt = new Date(timestamp).toISOString();
    await transaction.objectStore('app_meta').put({ id: 'pos:last_timestamp', timestamp });

    const saleId = generateId();
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
      payment_status: payload.amount_paid >= payload.total ? 'paid' : payload.amount_paid === 0 ? 'unpaid' : 'partial',
      status: 'completed',
      notes: payload.notes ?? null,
      receipt_url: payload.receipt_url ?? null,
      customer_name: payload.customer_name ?? null,
      customer_phone: payload.customer_phone ?? null,
      ...(atomicCheckoutEnabled() ? { stock_command_version: 1 } : {}),
      created_at: createdAt,
      updated_at: createdAt,
      synced: false,
    };
    const saleItems = payload.items.map(item => ({ ...item, id: generateId(), sale_id: saleId, created_at: createdAt }));
    const inventory = await transaction.objectStore('inventory').getAll() as InventoryRecord[];
    const positions = new Map(inventory.filter(row => row.organization_id === payload.organization_id)
      .map(row => [`${row.product_id}:${row.warehouse_id}`, row]));
    const updates = new Map<string, { before: InventoryRecord; after: InventoryRecord }>();

    for (const item of saleItems) {
      const stock = positions.get(`${item.product_id}:${item.warehouse_id}`);
      const current = stock && (updates.get(stock.id)?.after ?? stock);
      if (!stock || !current || !Number.isSafeInteger(current.quantity) || current.quantity < item.quantity) {
        throw new Error('Insufficient or missing stock at the selected location. Refresh stock before checking out.');
      }
      updates.set(stock.id, { before: stock, after: { ...current, quantity: current.quantity - item.quantity, updated_at: createdAt } });
    }

    await transaction.objectStore('sales').put(saleRecord);
    await addToSyncQueue('sales', 'INSERT', saleId, saleRecord, transaction);
    for (const item of saleItems) {
      await transaction.objectStore('sale_items').put(item);
      await addToSyncQueue('sale_items', 'INSERT', item.id, item, transaction);
    }
    for (const { before, after } of updates.values()) {
      await transaction.objectStore('inventory').put(after);
      await addToSyncQueue('inventory', 'UPDATE', after.id, { ...after }, transaction, {
        saleStock: { expectedVersion: before.updated_at, saleId },
      });
    }
    await done;
    return saleRecord;
  } catch (error) {
    try { transaction.abort(); } catch { /* The browser may have aborted it already. */ }
    await done.catch(() => {});
    throw error;
  }
}
