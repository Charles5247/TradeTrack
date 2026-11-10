import { createClient } from '@/lib/supabase/client';
import { addToSyncQueue, getDB, saveToOfflineDB, type InventoryRecord } from '@/lib/offline/db';
import { generateId } from '@/lib/utils/id';
import { isOffline } from '@/lib/utils/network';
import { withTimeout } from '@/lib/utils/timeout';
import { requireTransactionSubscription } from '@/lib/subscriptions/verification';

export interface StockReceipt {
  receipt_id?: string;
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  unit_cost: number;
  notes?: string;
}

export async function receiveStockAtCost(receipt: StockReceipt, options?: { forceOffline?: boolean }) {
  if (!Number.isSafeInteger(receipt.quantity) || receipt.quantity <= 0)
    throw new Error('Enter a whole-number quantity greater than zero.');
  if (!Number.isFinite(receipt.unit_cost) || receipt.unit_cost < 0 || receipt.unit_cost > 9999999999.99)
    throw new Error('Enter a valid buying cost per unit.');
  const id = receipt.receipt_id || generateId();
  const args = {
    p_receipt_id: id,
    p_product_id: receipt.product_id,
    p_warehouse_id: receipt.warehouse_id,
    p_quantity: receipt.quantity,
    p_unit_cost: receipt.unit_cost,
    p_notes: receipt.notes?.trim() || null,
  };
  const saveOffline = async () => {
    await requireTransactionSubscription(receipt.organization_id);
    const db = await getDB();
    const tx = db.transaction(['products', 'inventory', 'sync_queue'], 'readwrite');
    try {
      const product = await tx.objectStore('products').get(receipt.product_id);
      if (!product || product.organization_id !== receipt.organization_id)
        throw new Error('Open this product online once before receiving it offline.');
      const existing = await tx.objectStore('sync_queue').index('by-queue-key').getAll(['stock_receipts', id, 'INSERT']);
      if (existing.length) {
        if (JSON.stringify(existing[0].payload) !== JSON.stringify(args)) throw new Error('This receipt ID was already used for different stock. Review the receipt again.');
        await tx.done;
        return { offline: existing[0].status !== 'synced', averageCost: Number(product.cost_price) };
      }
      const rows = await tx.objectStore('inventory').getAll() as InventoryRecord[];
      const stock = rows.filter(row => row.product_id === receipt.product_id && row.organization_id === receipt.organization_id);
      const previousStock = stock.reduce((sum, row) => sum + row.quantity, 0);
      const oldCost = Number(product.cost_price);
      const average = Math.round((previousStock * oldCost + receipt.quantity * receipt.unit_cost) / (previousStock + receipt.quantity) * 100) / 100;
      const current = stock.find(row => row.warehouse_id === receipt.warehouse_id);
      const now = new Date().toISOString();
      await tx.objectStore('products').put({ ...product, cost_price: average, updated_at: now });
      await tx.objectStore('inventory').put({
        id: current?.id || generateId(), organization_id: receipt.organization_id,
        product_id: receipt.product_id, warehouse_id: receipt.warehouse_id,
        quantity: (current?.quantity || 0) + receipt.quantity,
        min_stock_level: current?.min_stock_level ?? 5, updated_at: now,
      });
      await addToSyncQueue('stock_receipts', 'INSERT', id, args, tx);
      await tx.done;
      return { offline: true, averageCost: average };
    } catch (error) {
      try { tx.abort(); } catch { /* Transaction may already have aborted. */ }
      throw error;
    }
  };
  if (options?.forceOffline || isOffline()) return saveOffline();
  try {
    const supabase = createClient();
    const result = await withTimeout(Promise.resolve(supabase.rpc('receive_stock_at_cost', args)), 5000);
    if (result.error) {
      if (/fetch failed|failed to fetch/i.test(result.error.message)) return saveOffline();
      throw result.error;
    }
    try {
      const [productResult, inventoryResult] = await Promise.all([
        supabase.from('products').select('*').eq('id', receipt.product_id).single(),
        supabase.from('inventory').select('*').eq('product_id', receipt.product_id).eq('warehouse_id', receipt.warehouse_id).single(),
      ]);
      if (productResult.data) await saveToOfflineDB('products', [productResult.data]);
      if (inventoryResult.data) await saveToOfflineDB('inventory', [inventoryResult.data]);
    } catch { /* Receipt committed; background sync refreshes the local cache. */ }
    return { offline: false, averageCost: Number(result.data) };
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && /timed out|fetch failed|failed to fetch/i.test(error.message))) return saveOffline();
    throw error;
  }
}
