import { addToSyncQueue, getDB, getAllFromOfflineDB } from './db';
import { generateId } from '@/lib/utils/id';
import type { Product, PurchaseOrder, PurchaseOrderItem, Supplier } from '@/types';
import { isOffline } from '@/lib/utils/network';

export interface OfflinePurchaseOrderPayload {
  organization_id: string;
  supplier_id: string;
  expected_date: string | null;
  notes: string;
  created_by: string;
  items: { product_id: string; quantity: string; unit_cost: string }[];
}

/** Draft creation does not change stock. Stock changes only on receipt. */
export async function persistOfflinePurchaseOrder(payload: OfflinePurchaseOrderPayload) {
  if (!payload.organization_id || !payload.supplier_id || !payload.created_by) {
    throw new Error('Organization, supplier and creator are required');
  }
  if (!payload.items.length) throw new Error('At least one purchase order item is required');
  const id = generateId();
  const now = new Date().toISOString();
  const items = payload.items.map((item) => {
    const quantity = Number(item.quantity);
    const cost = Number(item.unit_cost);
    if (!item.product_id || !item.quantity.trim() || !item.unit_cost.trim() ||
        !Number.isSafeInteger(quantity) || quantity <= 0 ||
        !Number.isFinite(cost) || cost < 0) {
      throw new Error('Invalid purchase order item');
    }
    return {
      id: generateId(), purchase_order_id: id, product_id: item.product_id,
      quantity_ordered: quantity, quantity_received: 0, unit_cost: cost, created_at: now,
    };
  });
  const total = items.reduce((sum, item) => sum + item.quantity_ordered * item.unit_cost, 0);
  if (!Number.isFinite(total)) throw new Error('Invalid purchase order total');
  const order = {
    id, organization_id: payload.organization_id, supplier_id: payload.supplier_id,
    status: 'draft' as const, expected_date: payload.expected_date,
    notes: payload.notes || null, created_by: payload.created_by,
    total_value: total, created_at: now, updated_at: now,
  };
  const db = await getDB();
  const tx = db.transaction(['purchase_orders', 'purchase_order_items', 'sync_queue'], 'readwrite');
  // Observe aborts immediately, including a request failure before awaiting done.
  const done = tx.done;
  void done.catch(() => {});
  try {
    await Promise.all([
      tx.objectStore('purchase_orders').put(order),
      ...items.map((item) => tx.objectStore('purchase_order_items').put(item)),
      addToSyncQueue('purchase_orders', 'INSERT', id, order, tx),
      ...items.map((item) => addToSyncQueue('purchase_order_items', 'INSERT', item.id, item, tx)),
    ]);
    await done;
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted by IndexedDB. */ }
    await done.catch(() => {});
    throw error;
  }
  return order;
}

/** Rebuild display joins from normalized caches; keep joins out of sync payloads. */
export type CachedPurchaseOrder = PurchaseOrder & { lifecycleReady: boolean };

export async function getOfflinePurchaseOrders(organizationId: string): Promise<CachedPurchaseOrder[]> {
  const [orders, items, suppliers, products] = await Promise.all([
    getAllFromOfflineDB<PurchaseOrder>('purchase_orders'),
    getAllFromOfflineDB<PurchaseOrderItem>('purchase_order_items'),
    getAllFromOfflineDB<Supplier>('suppliers'),
    getAllFromOfflineDB<Product>('products'),
  ]);
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const itemsByOrder = new Map<string, PurchaseOrderItem[]>();
  for (const item of items) {
    const group = itemsByOrder.get(item.purchase_order_id) ?? [];
    group.push({ ...item, product: productById.get(item.product_id) });
    itemsByOrder.set(item.purchase_order_id, group);
  }
  return orders.filter((order) => order.organization_id === organizationId)
    .map((order) => {
      const orderItems = itemsByOrder.get(order.id) ?? [];
      return { ...order, supplier: supplierById.get(order.supplier_id), items: orderItems,
        lifecycleReady: (order as PurchaseOrder & { synced?: boolean }).synced === true &&
          orderItems.length > 0 && orderItems.every((item) => (item as PurchaseOrderItem & { synced?: boolean }).synced === true),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function requireSyncedPurchaseOrder(id: string, organizationId: string) {
  if (isOffline()) throw new Error('Reconnect to send, cancel or receive purchase orders.');
  const order = (await getOfflinePurchaseOrders(organizationId)).find((row) => row.id === id);
  if (!order?.lifecycleReady) throw new Error('Wait for this order and all its items to sync before continuing.');
}
