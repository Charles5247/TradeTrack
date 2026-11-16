import { createClient } from '@/lib/supabase/client';
import { getDB, saveToOfflineDB } from './db';
import { visibleWarehouseIds } from '@/lib/warehouses/staff-visibility';

type Account = { id: string; organization_id?: string | null; role: string };

/** Download the data POS actually reads offline, without replacing queued local edits. */
export async function prepareOfflinePos(user: Account): Promise<{ warehouses: number; products: number }> {
  if (!user.organization_id || !['business_owner', 'admin', 'cashier'].includes(user.role))
    return { warehouses: 0, products: 0 };
  const org = user.organization_id;
  const visible = await visibleWarehouseIds(user);
  if (visible?.size === 0) throw new Error('No warehouse is assigned to this account.');
  const client = createClient();
  const db = await getDB();
  const queued = await db.getAll('sync_queue') as Array<{ table_name: string; record_id: string; status: string;
    payload?: { product_id?: string; warehouse_id?: string } }>;
  const preserve = (table: string) => new Set(queued.filter(item => item.table_name === table && item.status !== 'synced').map(item => item.record_id));

  let warehouseQuery = client.from('warehouses').select('*').eq('organization_id', org).order('id');
  if (visible) warehouseQuery = warehouseQuery.in('id', [...visible]);
  const { data: warehouses, error: warehouseError } = await warehouseQuery;
  if (warehouseError) throw warehouseError;
  if (!warehouses?.length) throw new Error('No available warehouse could be downloaded.');
  await saveToOfflineDB('warehouses', warehouses.filter(row => !preserve('warehouses').has(row.id)));

  const { data: categories, error: categoryError } = await client.from('categories')
    .select('*').eq('organization_id', org).order('id');
  if (categoryError) throw categoryError;
  await saveToOfflineDB('categories', (categories || []).filter(row => !preserve('categories').has(row.id)));

  const inventory: Array<{ id: string; product_id: string; warehouse_id: string }> = [];
  for (let start = 0; ; start += 500) {
    let query = client.from('inventory').select('*').eq('organization_id', org).order('id').range(start, start + 499);
    if (visible) query = query.in('warehouse_id', [...visible]);
    const { data, error } = await query;
    if (error) throw error;
    inventory.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  const inventoryPending = preserve('inventory');
  const pendingStockKeys = new Set(queued.filter(item => item.table_name === 'inventory' && item.status !== 'synced')
    .map(item => `${item.payload?.product_id || ''}:${item.payload?.warehouse_id || ''}`));
  await saveToOfflineDB('inventory', inventory.filter(row => !inventoryPending.has(row.id)
    && !pendingStockKeys.has(`${row.product_id}:${row.warehouse_id}`)));

  const products: Array<{ id: string }> = [];
  if (visible) {
    const ids = [...new Set(inventory.map(row => row.product_id))];
    for (let start = 0; start < ids.length; start += 200) {
      const { data, error } = await client.from('products').select('*')
        .eq('organization_id', org).in('id', ids.slice(start, start + 200));
      if (error) throw error;
      products.push(...(data || []));
    }
  } else {
    for (let start = 0; ; start += 500) {
      const { data, error } = await client.from('products').select('*')
        .eq('organization_id', org).order('id').range(start, start + 499);
      if (error) throw error;
      products.push(...(data || []));
      if (!data || data.length < 500) break;
    }
  }
  const productPending = preserve('products');
  await saveToOfflineDB('products', products.filter(row => !productPending.has(row.id)));
  return { warehouses: warehouses.length, products: products.length };
}
