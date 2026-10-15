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
    if (typeof data.business_verification_status !== 'string') {
      const { data: merchant, error: merchantError } = await db
        .from('merchants')
        .select('verification_status')
        .eq('organization_id', data.organization_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (merchantError) return Response.json({ error: 'Verification unavailable' }, { status: 503 });
      data.business_verification_status = merchant?.verification_status ?? 'unverified';
    }
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Verification unavailable' }, { status: 503 }); }
}
