import { addToSyncQueue, getDB } from '@/lib/offline/db';
import { isOffline } from '@/lib/utils/network';
import { withTimeout } from '@/lib/utils/timeout';
import type { DuplicateMode, ImportKind, PreviewRow } from './preview';
export interface ImportOptions { batchId: string; kind: ImportKind; mode: DuplicateMode; warehouseId: string; org: string; userId: string; role: string; rows: PreviewRow[]; }
export interface RowResult { row_number: number; outcome: string; error?: string; entity_id?: string; }
export async function loadImportCatalog(kind: ImportKind, org: string): Promise<Record<string,any>[]> {
  const cached = async () => {
    if (!['products','suppliers'].includes(kind)) throw new Error('Connect to import customers, historical sales or staff invitations.');
    return (await (await getDB()).getAll(kind)).filter(r => r.organization_id === org);
  };
  if (isOffline()) return cached();
  try { const r = await withTimeout(fetch(`/api/imports?kind=${kind}`), 5000); if (!r.ok) throw new Error('Could not load import catalog'); return r.json(); }
  catch { return cached(); }
}
async function queueChunk(options: ImportOptions, rows: PreviewRow[]): Promise<RowResult[]> {
  if (!['products','suppliers'].includes(options.kind)) throw new Error('This record type requires connectivity.');
  const db = await getDB();
  const tx = db.transaction(['app_meta','products','suppliers','inventory','sync_queue'],'readwrite');
  const done = tx.done; void done.catch(() => {});
  try {
    const now = new Date().toISOString();
    const batch = { id: options.batchId, organization_id: options.org, kind: options.kind, created_by: options.userId, summary: { rows: options.rows.length }, created_at: now };
    await tx.objectStore('app_meta').put({ ...batch, id: `import:${batch.id}`, batch_id: batch.id });
    await addToSyncQueue('import_batches','INSERT',batch.id,batch,tx);
    for (const row of rows) {
      if (row.outcome === 'create' || row.outcome === 'update') {
        const old = await tx.objectStore(options.kind).get(row.id);
        const value: Record<string,any> = { ...(old || row.existing || {}), id: row.id, organization_id: options.org, name: row.data.name, import_batch_id: batch.id, updated_at: now, created_at: old?.created_at || now };
        if (options.kind === 'products') Object.assign(value, { sku: row.data.sku, barcode: row.data.barcode || null, selling_price: Number(row.data.selling_price || 0), cost_price: Number(row.data.cost_price || 0), status: old?.status || 'active', created_by: options.userId });
        else Object.assign(value, { email: row.data.email || null, phone: row.data.phone || null, address: row.data.address || null, status: old?.status || 'active' });
        await tx.objectStore(options.kind).put(value);
        if (options.kind === 'products' && row.outcome === 'create' && Number(row.data.opening_stock) > 0) {
          await tx.objectStore('inventory').put({ id: row.data.inventory_id, organization_id: options.org, product_id: row.id, warehouse_id: options.warehouseId, quantity: Number(row.data.opening_stock), min_stock_level: 0, updated_at: now, import_batch_id: batch.id });
        }
      }
      const command = { batch: options.batchId, row_index: row.index, row_data: row.data, duplicate_mode: options.mode, warehouse: options.warehouseId || null, proposed_id: row.id, organization_id: options.org, local_before: row.existing || null };
      await addToSyncQueue('import_commands','INSERT',`${options.batchId}:${row.index}`,command,tx);
      await tx.objectStore('app_meta').put({ id: `import-result:${options.batchId}:${row.index}`, batch_id: options.batchId, row_number: row.index, outcome: 'queued', entity_id: row.id });
    }
    await done; return rows.map(r => ({ row_number: r.index, outcome: 'queued', entity_id: r.id }));
  } catch (e) { try { tx.abort(); } catch {} await done.catch(() => {}); throw e; }
}
export async function executeImport(options: ImportOptions, progress: (done: number) => void): Promise<RowResult[]> {
  if (!['business_owner','admin'].includes(options.role) || (options.kind === 'staff_invites' && options.role !== 'business_owner')) throw new Error('You do not have permission to import these records.');
  if (!options.org || !options.userId) throw new Error('Business membership required.');
  if (options.rows.some(r => r.errors.length)) throw new Error('Fix row errors before confirming.');
  const results: RowResult[] = [];
  for (let start = 0; start < options.rows.length; start += 50) {
    const rows = options.rows.slice(start,start+50).map(r => ({ ...r, data: { ...r.data, inventory_id: r.data.inventory_id || crypto.randomUUID() } }));
    if (isOffline()) results.push(...await queueChunk(options,rows));
    else {
      try {
        const response = await withTimeout(fetch(options.kind === 'staff_invites' ? '/api/users' : '/api/imports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: options.mode, action: options.kind === 'staff_invites' ? 'import_invites' : 'import', confirm: true, batch_id: options.batchId, kind: options.kind, warehouse_id: options.warehouseId, summary: { rows: options.rows.length }, rows }) }),15000);
        const body = await response.json();
        if (!response.ok) { results.push(...rows.map(r => ({ row_number: r.index, outcome: 'error', error: body.error || 'Import rejected' }))); }
        else results.push(...body);
      } catch (error) {
        if (error instanceof TypeError || isOffline() || (error instanceof Error && error.message === 'Operation timed out')) results.push(...await queueChunk(options,rows));
        else throw error;
      }
    }
    progress(Math.min(start+50,options.rows.length));
    await new Promise(resolve => setTimeout(resolve,0));
  }
  return results;
}
