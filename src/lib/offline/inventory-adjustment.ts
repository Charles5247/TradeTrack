import { createClient } from '@/lib/supabase/client';
import { generateId } from '@/lib/utils/id';
import { getAccountRevision } from '@/lib/auth/account-state';
import { addToSyncQueue, getDB, type InventoryRecord, type SyncQueueRecord } from './db';

export interface InventoryAdjustmentPayload {
 organization_id: string; user_id: string; product_id: string; warehouse_id: string;
 inventory_id?: string; current_quantity?: number; min_stock_level?: number;
 quantity_change: number; movement_type: 'in' | 'out' | 'adjustment'; notes?: string; reason?: string;
}
type OfflineDatabase = Awaited<ReturnType<typeof getDB>>;

export async function postSavedAdjustment(db: OfflineDatabase, entry: SyncQueueRecord, client=createClient(),revision=getAccountRevision()) {
  if(revision!==getAccountRevision()) throw new Error('Account changed; saved adjustment was not sent.');
  const { data,error }=await client.rpc('apply_inventory_adjustment',{command:entry.payload});
  if(error) throw new Error(error.message);
  const stock=data as InventoryRecord | null;
  if(!stock || stock.organization_id!==entry.payload.organization_id || stock.product_id!==entry.payload.product_id ||
    stock.warehouse_id!==entry.payload.warehouse_id || !Number.isSafeInteger(stock.quantity) || stock.quantity<0 || !stock.id || !stock.updated_at) {
    throw new Error('Stock confirmation is incomplete. Retry the saved adjustment.');
  }
  const tx=db.transaction(['inventory','sync_queue'],'readwrite');
  void tx.done.catch(()=>{});
  try {
    await tx.objectStore('sync_queue').put({...entry,status:'synced',error:undefined,synced_at:new Date().toISOString()});
    const local=await tx.objectStore('inventory').get(String(entry.payload.inventory_id));
    if(local?.updated_at===entry.payload.created_at) {
      if(local.id!==stock.id) await tx.objectStore('inventory').delete(local.id);
      await tx.objectStore('inventory').put(stock);
    }
    await tx.done;
  } catch(error) {
    try {tx.abort();} catch { /* Already aborted. */ }
    await tx.done.catch(()=>{}); throw error;
  }
  return stock;
}

export async function recordInventoryAdjustment(payload: InventoryAdjustmentPayload) {
  if(!Number.isSafeInteger(payload.quantity_change) || !payload.quantity_change || Math.abs(payload.quantity_change)>2147483647 ||
    !payload.organization_id || !payload.user_id || !payload.product_id || !payload.warehouse_id || (payload.reason?.trim().length ?? 0)<3) {
    throw new Error('A valid integer stock change and reason are required.');
  }
  const revision=getAccountRevision(), db=await getDB(), id=generateId(), createdAt=new Date().toISOString();
  const tx=db.transaction(['inventory','sync_queue'],'readwrite');
  void tx.done.catch(()=>{});
  let entry: SyncQueueRecord;
  let quantity: number;
  try {
    const rows=await tx.objectStore('inventory').getAll() as InventoryRecord[];
    const cached=rows.find(row=>row.organization_id===payload.organization_id && row.product_id===payload.product_id && row.warehouse_id===payload.warehouse_id);
    quantity=(cached?.quantity ?? payload.current_quantity ?? 0)+payload.quantity_change;
    if(!Number.isSafeInteger(quantity) || quantity<0 || quantity>2147483647) throw new Error('Invalid or insufficient stock.');
    const stock={...cached,id:cached?.id ?? payload.inventory_id ?? generateId(),organization_id:payload.organization_id,
      product_id:payload.product_id,warehouse_id:payload.warehouse_id,quantity,min_stock_level:cached?.min_stock_level ?? payload.min_stock_level ?? 5,updated_at:createdAt};
    await tx.objectStore('inventory').put(stock);
    const command={...payload,id,inventory_id:stock.id,reason:payload.reason!.trim(),created_at:createdAt};
    await addToSyncQueue('inventory_adjustment_commands','INSERT',id,command,tx);
    entry=(await tx.objectStore('sync_queue').index('by-queue-key').getAll(['inventory_adjustment_commands',id,'INSERT']))[0] as SyncQueueRecord;
    await tx.done;
  } catch(error) {
    try {tx.abort();} catch { /* Already aborted. */ }
    await tx.done.catch(()=>{}); throw error;
  }
  if(!navigator.onLine || revision!==getAccountRevision()) return {offline:true,quantity};
  try { const stock=await postSavedAdjustment(db,entry,undefined,revision); return {offline:false,quantity:stock.quantity}; }
  catch(error) {
    const current=await db.get('sync_queue',entry.id) as SyncQueueRecord | undefined;
    if(current?.status==='synced') return {offline:false,quantity};
    await db.put('sync_queue',{...entry,status:'failed',error:error instanceof Error ? error.message : 'Stock adjustment requires review'});
    if(error instanceof TypeError) return {offline:true,quantity};
    throw error;
  }
}
