import { addToSyncQueue, getDB, getAllFromOfflineDB, type InventoryRecord, type SaleRecord, type WarehouseRecord } from './db';
import { generateId } from '@/lib/utils/id';
import { isOffline } from '@/lib/utils/network';
import type { Product, VendorTransaction, VendorTransactionItem } from '@/types';

export interface OfflineVendorTransactionPayload {
  organization_id: string;
  created_by: string;
  vendor_name: string;
  vendor_phone?: string;
  vendor_email?: string;
  date_issued: string;
  expected_payment_date?: string;
  notes?: string;
  items: { product_id: string; quantity: string; unit_price: string }[];
}

export async function persistOfflineVendorTransaction(payload: OfflineVendorTransactionPayload) {
  if (!payload.organization_id || !payload.created_by || !payload.vendor_name.trim() || !payload.date_issued) {
    throw new Error('Organization, creator, vendor name and issue date are required');
  }
  if (!payload.items.length) throw new Error('At least one vendor item is required');
  const id = generateId();
  const saleId = generateId();
  const now = new Date().toISOString();
  const items = payload.items.map((item) => {
    const quantity = Number(item.quantity);
    const price = Number(item.unit_price);
    if (!item.product_id || !item.quantity.trim() || !item.unit_price.trim() ||
        !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) {
      throw new Error('Invalid vendor item quantity or price');
    }
    return { id: generateId(), vendor_transaction_id: id, product_id: item.product_id,
      quantity, unit_price: price, total: quantity * price, created_at: now };
  });
  const total = items.reduce((sum, item) => sum + item.total, 0);
  if (!Number.isFinite(total)) throw new Error('Invalid vendor transaction total');
  const vendor = { id, organization_id: payload.organization_id, created_by: payload.created_by,
    vendor_name: payload.vendor_name, vendor_phone: payload.vendor_phone || null, vendor_email: payload.vendor_email || null,
    date_issued: payload.date_issued, expected_payment_date: payload.expected_payment_date || null,
    notes: payload.notes || null, status: 'pending' as const, total_value: total, amount_paid: 0,
    created_at: now, updated_at: now };

  const db = await getDB();
  const tx = db.transaction(['vendor_transactions', 'vendor_transaction_items', 'sales', 'inventory', 'warehouses', 'sync_queue'], 'readwrite');
  const done = tx.done;
  void done.catch(() => {});
  try {
    const warehouses = await getAllFromOfflineDB<WarehouseRecord>('warehouses', tx);
    const warehouse = warehouses.filter((row) => row.organization_id === payload.organization_id)
      .sort((a, b) => a.name.localeCompare(b.name))[0];
    if (!warehouse) throw new Error('No cached warehouse available. Reconnect to load warehouses first.');
    const inventory = await getAllFromOfflineDB<InventoryRecord>('inventory', tx);
    const byProduct = new Map<string, InventoryRecord[]>();
    for (const row of inventory) {
      if (row.organization_id !== payload.organization_id) continue;
      const group = byProduct.get(row.product_id) ?? [];
      group.push(row);
      byProduct.set(row.product_id, group);
    }
    const updates = new Map<string, InventoryRecord>();
    for (const item of items) {
      const rows = byProduct.get(item.product_id) ?? [];
      const stock = rows.reduce<InventoryRecord | undefined>((best, row) => !best || row.quantity > best.quantity ? row : best, undefined);
      // Match the online flow: insufficient/missing stock is not decremented.
      if (stock && stock.quantity >= item.quantity) {
        stock.quantity -= item.quantity;
        stock.updated_at = now;
        updates.set(stock.id, { ...stock });
      }
    }
    const sale = { id: saleId, organization_id: payload.organization_id, cashier_id: payload.created_by,
      warehouse_id: warehouse.id, invoice_number: `VENDOR-${String(Date.now()).slice(-6)}`, customer_name: payload.vendor_name,
      customer_phone: payload.vendor_phone || null, subtotal: total, discount: 0, tax: 0, total,
      amount_paid: 0, change_amount: 0, payment_method: 'transfer', payment_status: 'unpaid',
      status: 'pending', notes: `Vendor transaction ${id}`, created_at: now, updated_at: now, synced: false };
    await Promise.all([
      tx.objectStore('vendor_transactions').put(vendor),
      ...items.map((item) => tx.objectStore('vendor_transaction_items').put(item)),
      tx.objectStore('sales').put(sale),
      ...Array.from(updates.values(), (row) => tx.objectStore('inventory').put(row)),
      addToSyncQueue('vendor_transactions', 'INSERT', id, vendor, tx),
      ...items.map((item) => addToSyncQueue('vendor_transaction_items', 'INSERT', item.id, item, tx)),
      addToSyncQueue('sales', 'INSERT', saleId, sale, tx),
      ...Array.from(updates.values(), (row) => addToSyncQueue('inventory', 'UPDATE', row.id, { ...row }, tx, { refreshPendingInventoryUpdate: true })),
    ]);
    await done;
    return vendor;
  } catch (error) {
    try { tx.abort(); } catch { /* IndexedDB may already have aborted. */ }
    await done.catch(() => {});
    throw error;
  }
}

export type CachedVendorTransaction = VendorTransaction & { paymentReady: boolean };

export async function getOfflineVendorTransactions(organizationId: string): Promise<CachedVendorTransaction[]> {
  const [vendors, items, products, sales] = await Promise.all([
    getAllFromOfflineDB<VendorTransaction & { synced?: boolean }>('vendor_transactions'),
    getAllFromOfflineDB<VendorTransactionItem & { synced?: boolean }>('vendor_transaction_items'),
    getAllFromOfflineDB<Product>('products'), getAllFromOfflineDB<SaleRecord>('sales'),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const itemsByVendor = new Map<string, (VendorTransactionItem & { synced?: boolean })[]>();
  for (const item of items) {
    const group = itemsByVendor.get(item.vendor_transaction_id) ?? [];
    group.push({ ...item, product: productById.get(item.product_id) });
    itemsByVendor.set(item.vendor_transaction_id, group);
  }
  const syncedSaleNotes = new Set(sales.filter((sale) => sale.organization_id === organizationId && sale.synced && !sale.deleted_at).map((sale) => sale.notes));
  return vendors.filter((vendor) => vendor.organization_id === organizationId).map((vendor) => {
    const lines = itemsByVendor.get(vendor.id) ?? [];
    return { ...vendor, items: lines, paymentReady: vendor.synced === true && lines.length > 0 &&
      lines.every((item) => item.synced === true) && syncedSaleNotes.has(`Vendor transaction ${vendor.id}`) };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function requireSyncedVendorTransaction(id: string, organizationId: string) {
  if (isOffline()) throw new Error('Reconnect to record a vendor payment.');
  const vendor = (await getOfflineVendorTransactions(organizationId)).find((row) => row.id === id);
  if (!vendor?.paymentReady) throw new Error('Wait for this transaction, its items and linked sale to sync before recording payment.');
}
