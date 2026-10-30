import { addToSyncQueue, getAllFromOfflineDB, saveToOfflineDB, type InventoryRecord } from '@/lib/offline/db';
import { requireTransactionSubscription } from '@/lib/subscriptions/verification';
import { createClient } from '@/lib/supabase/client';
import { generateId } from '@/lib/utils/id';
import { isOffline } from '@/lib/utils/network';

export interface StockAdjustment {
  organization_id: string;
  user_id: string;
  product_id: string;
  warehouse_id: string;
  inventory_id?: string;
  current_quantity?: number;
  min_stock_level?: number;
  quantity_change: number;
  reason: string;
}

export async function adjustProductStock(payload: StockAdjustment) {
  const reason = payload.reason.trim();
  if (reason.length < 3) throw new Error('A stock adjustment reason is required.');
  if (!Number.isSafeInteger(payload.quantity_change) || payload.quantity_change === 0) throw new Error('Enter a valid whole-number adjustment.');

  const saveOffline = async () => {
    await requireTransactionSubscription(payload.organization_id);
    const now = new Date().toISOString();
    const cached = (await getAllFromOfflineDB<InventoryRecord>('inventory')).find(row => row.product_id === payload.product_id && row.warehouse_id === payload.warehouse_id);
    const inventoryId = cached?.id ?? payload.inventory_id ?? generateId();
    const oldQuantity = cached?.quantity ?? payload.current_quantity ?? 0;
    const newQuantity = oldQuantity + payload.quantity_change;
    if (newQuantity < 0) throw new Error('Stock cannot be reduced below zero.');
    const inventory: InventoryRecord = {
      id: inventoryId,
      organization_id: payload.organization_id,
      product_id: payload.product_id,
      warehouse_id: payload.warehouse_id,
      quantity: newQuantity,
      min_stock_level: cached?.min_stock_level ?? payload.min_stock_level ?? 5,
      updated_at: now,
    };
    await saveToOfflineDB('inventory', [inventory]);
    const movementId = generateId();
    const auditId = generateId();
    await Promise.all([
      addToSyncQueue('inventory', 'UPDATE', inventoryId, inventory as unknown as Record<string, unknown>),
      addToSyncQueue('inventory_movements', 'INSERT', movementId, {
        id: movementId, organization_id: payload.organization_id, product_id: payload.product_id,
        warehouse_id: payload.warehouse_id, movement_type: 'adjustment', quantity: payload.quantity_change,
        notes: reason, created_by: payload.user_id, created_at: now,
      }),
      addToSyncQueue('audit_logs', 'INSERT', auditId, {
        id: auditId, organization_id: payload.organization_id, user_id: payload.user_id,
        action: 'ADJUST_STOCK', resource_type: 'inventory', resource_id: payload.product_id,
        old_values: { quantity: oldQuantity }, new_values: { quantity: newQuantity }, reason, created_at: now,
      }),
    ]);
    return { offline: true, quantity: newQuantity };
  };

  if (isOffline()) return saveOffline();
  const supabase = createClient();
  let current: { id: string; quantity: number; min_stock_level: number | null } | null;
  try {
    const result = await supabase.from('inventory').select('id,quantity,min_stock_level').eq('product_id', payload.product_id).eq('warehouse_id', payload.warehouse_id).maybeSingle();
    if (result.error) throw result.error;
    current = result.data;
  } catch {
    return saveOffline();
  }
  const oldQuantity = current?.quantity ?? 0;
  const newQuantity = oldQuantity + payload.quantity_change;
  if (newQuantity < 0) throw new Error('Stock cannot be reduced below zero.');
  if (current) {
    const { error } = await supabase.from('inventory').update({ quantity: newQuantity }).eq('id', current.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('inventory').insert({
      organization_id: payload.organization_id, product_id: payload.product_id,
      warehouse_id: payload.warehouse_id, quantity: newQuantity, min_stock_level: payload.min_stock_level ?? 5,
    });
    if (error) throw error;
  }
  const { error: movementError } = await supabase.from('inventory_movements').insert({
    organization_id: payload.organization_id, product_id: payload.product_id, warehouse_id: payload.warehouse_id,
    movement_type: 'adjustment', quantity: payload.quantity_change, notes: reason, created_by: payload.user_id,
  });
  if (movementError) throw movementError;
  const { error: auditError } = await supabase.from('audit_logs').insert({
    organization_id: payload.organization_id, user_id: payload.user_id, action: 'ADJUST_STOCK',
    resource_type: 'inventory', resource_id: payload.product_id,
    old_values: { quantity: oldQuantity }, new_values: { quantity: newQuantity }, reason,
  });
  if (auditError) throw auditError;
  return { offline: false, quantity: newQuantity };
}
