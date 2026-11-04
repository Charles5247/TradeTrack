import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

export async function POST(request: Request) {
  const db = await createClient();
  if (!db) return Response.json({ error: 'Service unavailable.' }, { status: 503 });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });

  let ids: unknown;
  try { ids = (await request.json()).ids; } catch { /* Invalid body. */ }
  if (!Array.isArray(ids) || ids.length > 1000 || ids.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
    return Response.json({ error: 'Provide up to 1000 sale IDs.' }, { status: 400 });
  }
  if (ids.length === 0) return Response.json({ reversals: {} }, { headers: { 'Cache-Control': 'no-store' } });

  // The caller's RLS policy decides which sales are visible before the
  // service role reads reversal rows. Cashiers receive only status kinds.
  const { data: visible, error: saleError } = await db.from('sales').select('id').in('id', ids);
  if (saleError) return Response.json({ error: 'Unable to check sales.' }, { status: 503 });
  const visibleIds = (visible || []).map(sale => sale.id);
  if (!visibleIds.length) return Response.json({ reversals: {} }, { headers: { 'Cache-Control': 'no-store' } });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: 'Reversal status unavailable.' }, { status: 503 });
  }
  const admin = createServiceClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.from('financial_reversals').select('sale_id,kind')
    .in('sale_id', visibleIds).in('kind', ['void', 'refund', 'return']);
  if (error) return Response.json({ error: 'Unable to load reversals.' }, { status: 503 });
  return Response.json({ reversals: Object.fromEntries((data || []).map(row => [row.sale_id, row.kind])) }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
