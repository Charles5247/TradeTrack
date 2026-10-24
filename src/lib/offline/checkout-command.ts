import { createClient } from '@/lib/supabase/client';
import { getAccountRevision } from '@/lib/auth/account-state';
import { getDB, type SyncQueueRecord } from './db';

export function atomicCheckoutEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ATOMIC_CHECKOUT_ENABLED === 'true';
}
type OfflineDatabase = Awaited<ReturnType<typeof getDB>>;
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
interface CheckoutResult { sale_id: string; official_invoice_number: number; stocks: { id: string; quantity: number; updated_at: string }[] }
const saleKeys = ['id','organization_id','invoice_number','cashier_id','warehouse_id','customer_name','customer_phone',
  'subtotal','discount','tax','total','amount_paid','change_amount','payment_method','status','notes','receipt_url','created_at'];
const lineKeys = ['id','sale_id','product_id','warehouse_id','quantity','unit_price','cost_price','discount','total'];
function selectFields(row: Record<string, unknown>, keys: string[]): { [key: string]: Json } {
  return Object.fromEntries(keys.map(key => {
    const value = row[key] ?? null;
    if (typeof value !== 'string' && typeof value !== 'number' && value !== null) throw new Error(`Invalid receipt field: ${key}`);
    return [key, value];
  }));
}
function parseResult(data: unknown, saleId: string): CheckoutResult {
  const result = data as CheckoutResult | null;
  if (!result || result.sale_id !== saleId || !Array.isArray(result.stocks) || !result.stocks.length ||
    !result.stocks.every(stock => typeof stock.id === 'string' && Number.isSafeInteger(stock.quantity) && stock.quantity >= 0 && typeof stock.updated_at === 'string')) {
    throw new Error('Checkout confirmation is incomplete. Retry the saved receipt safely.');
  }
  return result;
}

/** Retry the same immutable receipt; the server owns validation, locks and replay. */
export async function postSavedCheckout(db: OfflineDatabase, saleId: string, organizationId: string,
  client = createClient(), recoveryReason?: string, revision=getAccountRevision()): Promise<void> {
  if (!atomicCheckoutEnabled()) throw new Error('Atomic checkout is not enabled in this environment. Saved work is preserved.');
  const sale = await db.get('sales', saleId) as Record<string, unknown> | undefined;
  const lines = await db.getAllFromIndex('sale_items', 'by-sale', saleId) as Record<string, unknown>[];
  if (!sale || sale.organization_id !== organizationId || !lines.length) throw new Error('Saved receipt is missing or belongs to another business.');
  const command = { sale: selectFields(sale, saleKeys), items: lines.sort((a,b) => String(a.id).localeCompare(String(b.id))).map(line => selectFields(line, lineKeys)) };
  if (revision !== getAccountRevision()) throw new Error('Account changed; saved receipt was not sent.');
  const { data, error } = await client.rpc('post_pos_checkout', { command, reconcile_legacy: !!recoveryReason, recovery_reason: recoveryReason ?? null });
  if (error) throw new Error(error.message);
  const result = parseResult(data, saleId);
  // Pin writes to the originating database even if the account changed while
  // the server was committing. Never redirect this acknowledgement to a new DB.
  const tx = db.transaction(['sales','inventory','sync_queue'], 'readwrite');
  void tx.done.catch(() => {});
  try {
    await tx.objectStore('sales').put({ ...sale, synced: true, official_invoice_number: result.official_invoice_number });
    const queue = tx.objectStore('sync_queue');
    const entries = await queue.getAll() as SyncQueueRecord[];
    const versions = new Map(result.stocks.map(stock => [stock.id, stock.updated_at]));
    const related = entries.filter(entry => (entry.table_name === 'sales' && entry.record_id === saleId) ||
      (entry.table_name === 'sale_items' && entry.payload.sale_id === saleId) ||
      (entry.table_name === 'inventory' && (entry.stock_sync?.sale_id === saleId ||
        (entry.payload.organization_id === organizationId && entry.payload.updated_at === sale.created_at && versions.has(entry.record_id)))));
    const completed = new Set(related.map(entry => entry.id));
    for (const entry of related) await queue.put({ ...entry, status: 'synced', synced_at: new Date().toISOString(), error: undefined,
      ...(entry.stock_sync ? { stock_sync: { ...entry.stock_sync, review_reason: undefined, confirmed_version: versions.get(entry.record_id) } } : {}) });
    for (const entry of entries) {
      if (entry.stock_sync?.predecessor_id && completed.has(entry.stock_sync.predecessor_id)) {
        await queue.put({ ...entry, stock_sync: { ...entry.stock_sync, predecessor_id: undefined, expected_version: versions.get(entry.record_id) } });
      }
    }
    for (const stock of result.stocks) {
      const local = await tx.objectStore('inventory').get(stock.id);
      if (local?.updated_at === sale.created_at) await tx.objectStore('inventory').put({ ...local, ...stock });
    }
    await tx.done;
  } catch (error) {
    try { tx.abort(); } catch { /* Already aborted. */ }
    await tx.done.catch(() => {});
    throw error;
  }
}

export async function getCheckoutRecovery(organizationId: string) {
  const db = await getDB();
  const [sales, entries] = await Promise.all([db.getAll('sales'), db.getAll('sync_queue')]);
  const queue = entries as SyncQueueRecord[];
  return sales.filter(sale => sale.organization_id === organizationId && !String(sale.notes ?? '').startsWith('Vendor transaction ') &&
    (!sale.synced || queue.some(entry => entry.status !== 'synced' && (entry.stock_sync?.sale_id === sale.id ||
      (entry.table_name === 'sales' && entry.record_id === sale.id) || (entry.table_name === 'sale_items' && entry.payload.sale_id === sale.id)))))
    .map(sale => ({ id: String(sale.id), invoice: String(sale.invoice_number), createdAt: String(sale.created_at),
      total: Number(sale.total), error: queue.find(entry => entry.record_id === sale.id && entry.error)?.error ?? 'Saved locally; awaiting server confirmation' }));
}
