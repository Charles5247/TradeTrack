import { createClient } from '@/lib/supabase/client';
import { getDB } from '@/lib/offline/db';

type Staff = { id: string; organization_id?: string | null; role: string } | null | undefined;

/** Null means owner-wide access. Staff with no assignment receive an empty set. */
export async function visibleWarehouseIds(user: Staff): Promise<Set<string> | null> {
  if (!user || !user.organization_id) return new Set();
  if (user.role === 'business_owner') return null;
  if (user.role !== 'admin' && user.role !== 'cashier') return new Set();
  const key = `warehouse-assignments:${user.organization_id}:${user.id}`;
  const db = await getDB();
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    const { data, error } = await createClient().from('warehouse_staff')
      .select('warehouse_id').eq('organization_id', user.organization_id).eq('user_id', user.id);
    if (!error) {
      const ids = (data || []).map(row => row.warehouse_id);
      await db.put('app_meta', { id: key, warehouse_ids: ids });
      return new Set(ids);
    }
  }
  const cached = await db.get('app_meta', key) as { warehouse_ids?: string[] } | undefined;
  return new Set(cached?.warehouse_ids || []);
}
