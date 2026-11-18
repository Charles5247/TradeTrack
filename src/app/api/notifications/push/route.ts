import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { paymentAdmin } from '@/lib/subscriptions/zainpay-checkout';

const subscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(40).max(256), auth: z.string().min(8).max(128) }),
});

async function caller() {
  const db = await createClient();
  if (!db) return null;
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from('users').select('id,organization_id,status').eq('id', user.id).single();
  if (profile?.status !== 'active') return null;
  return profile;
}

export async function GET() {
  if (!await caller()) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  return Response.json({ publicKey: publicKey || null });
}

export async function POST(request: Request) {
  const profile = await caller();
  if (!profile) return Response.json({ error: 'Sign in required' }, { status: 401 });
  if (!process.env.WEB_PUSH_PUBLIC_KEY || !process.env.WEB_PUSH_PRIVATE_KEY || !process.env.WEB_PUSH_SUBJECT)
    return Response.json({ error: 'Push delivery is not configured' }, { status: 503 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid push subscription' }, { status: 400 });
  const endpoint = new URL(parsed.data.endpoint);
  // This first release targets iOS Home Screen Web Push. Do not let a
  // subscription register an arbitrary URL that the sender would later POST.
  if (endpoint.protocol !== 'https:' || !(endpoint.hostname === 'web.push.apple.com' || endpoint.hostname.endsWith('.push.apple.com')))
    return Response.json({ error: 'Unsupported push service' }, { status: 400 });
  const admin = paymentAdmin();
  const { data: existing, error: lookupError } = await admin.from('notification_push_subscriptions').select('id,user_id').eq('endpoint', endpoint.href).maybeSingle();
  if (lookupError) return Response.json({ error: 'Push subscriptions unavailable' }, { status: 503 });
  if (existing && existing.user_id !== profile.id) return Response.json({ error: 'This device belongs to another account' }, { status: 409 });
  const values = {
    endpoint: endpoint.href, user_id: profile.id, organization_id: profile.organization_id,
    p256dh: parsed.data.keys.p256dh, auth_secret: parsed.data.keys.auth,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await admin.from('notification_push_subscriptions').update(values).eq('id', existing.id).eq('user_id', profile.id)
    : await admin.from('notification_push_subscriptions').insert(values);
  if (error) return Response.json({ error: 'Could not save push subscription' }, { status: 503 });
  return Response.json({ subscribed: true });
}

export async function DELETE(request: Request) {
  const profile = await caller();
  if (!profile) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const endpoint = (await request.json().catch(() => null))?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return Response.json({ error: 'Invalid subscription' }, { status: 400 });
  const { error } = await paymentAdmin().from('notification_push_subscriptions').delete()
    .eq('endpoint', endpoint).eq('user_id', profile.id);
  if (error) return Response.json({ error: 'Could not remove push subscription' }, { status: 503 });
  return Response.json({ subscribed: false });
}
