import { createClient } from '@/lib/supabase/server';
import { AUTH_CHECK_TIMEOUT_MS, withTimeout } from '@/lib/utils/timeout';

export async function GET() {
  try {
    const db = await createClient();
    if (!db) return Response.json({ error: 'Unavailable' }, { status: 503 });
    const { data: { user } } = await withTimeout(db.auth.getUser(), AUTH_CHECK_TIMEOUT_MS);
    if (!user) return Response.json({ error: 'Sign in required' }, { status: 401 });
    // RPC uses database time, authenticated user and organization membership.
    const { data, error } = await (db as any).rpc('verify_business_subscription');
    if (error) return Response.json({ error: 'Verification unavailable' }, { status: 503 });
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Verification unavailable' }, { status: 503 }); }
}
