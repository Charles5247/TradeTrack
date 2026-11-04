import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notifyMerchantOwners, platformDb } from '@/lib/platform/support';

const schema = z.object({
  organizationId: z.uuid(),
  title: z.string().trim().min(5).max(160),
  message: z.string().trim().min(5).max(3000),
});

export async function POST(request: Request) {
  const db = await createClient();
  if (!db) return Response.json({ error: 'Service unavailable.' }, { status: 503 });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const { data: profile } = await db.from('users').select('role,status').eq('id', user.id).single();
  if (profile?.role !== 'platform_owner' || profile.status !== 'active') {
    return Response.json({ error: 'Platform owner access required.' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a merchant, title, and message.' }, { status: 400 });
  const { organizationId, title, message } = parsed.data;
  const admin = platformDb();
  const { data: merchant, error } = await admin.from('merchants').select('id').eq('organization_id', organizationId).maybeSingle();
  if (error || !merchant) return Response.json({ error: 'Merchant not found.' }, { status: 404 });
  try { await notifyMerchantOwners(organizationId, title, message); }
  catch (notifyError) {
    console.error('[platform messages] delivery failed', notifyError);
    return Response.json({ error: 'Could not send the message.' }, { status: 503 });
  }
  return Response.json({ sent: true }, { status: 201 });
}
