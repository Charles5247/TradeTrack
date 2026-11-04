import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notifyMerchantOwners, notifyPlatformOwners, platformDb } from '@/lib/platform/support';

const reportSchema = z.object({
  source: z.enum(['merchant', 'sync']).default('merchant'),
  title: z.string().trim().min(5).max(160),
  detail: z.string().trim().min(5).max(5000),
  dedupeKey: z.string().max(160).optional(),
});
const updateSchema = z.object({
  id: z.uuid(), status: z.enum(['open', 'in_progress', 'resolved']),
  ownerNote: z.string().trim().max(3000).optional(),
});

async function context() {
  const db = await createClient();
  if (!db) return null;
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from('users').select('id,organization_id,role,status').eq('id', user.id).single();
  if (!profile || profile.status !== 'active') return null;
  return { db, profile };
}

export async function GET() {
  const ctx = await context();
  if (!ctx) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  let query = ctx.db.from('support_cases' as never).select('*').order('created_at', { ascending: false }).limit(100);
  if (ctx.profile.role !== 'platform_owner') query = query.eq('organization_id', ctx.profile.organization_id!);
  const { data, error } = await query;
  if (error) return Response.json({ error: 'Support cases are unavailable.' }, { status: 503 });
  return Response.json({ cases: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx?.profile.organization_id || ctx.profile.role === 'platform_owner') return Response.json({ error: 'Merchant access required.' }, { status: 403 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a title and description.' }, { status: 400 });
  const { source, title, detail, dedupeKey } = parsed.data;
  if (source === 'sync' && !dedupeKey) return Response.json({ error: 'Sync error key required.' }, { status: 400 });
  const admin = platformDb();
  if (source === 'sync') {
    const { data: existing } = await admin.from('support_cases' as never).select('id')
      .eq('organization_id', ctx.profile.organization_id).eq('reporter_id', ctx.profile.id)
      .eq('dedupe_key', dedupeKey!).neq('status', 'resolved').maybeSingle();
    if (existing) return Response.json({ id: (existing as { id: string }).id, existing: true });
  }
  const { data, error } = await admin.from('support_cases' as never).insert({
    organization_id: ctx.profile.organization_id, reporter_id: ctx.profile.id,
    source, title, detail, dedupe_key: source === 'sync' ? dedupeKey : null,
  } as never).select('id').single();
  if (error) return Response.json({ error: 'Could not save the report.' }, { status: 503 });
  const id = (data as { id: string }).id;
  try { await notifyPlatformOwners(source === 'sync' ? 'Cashier sync failure' : 'Merchant reported an issue', title, id); }
  catch (error) { console.error('[support] owner notification failed', error); }
  return Response.json({ id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const ctx = await context();
  if (ctx?.profile.role !== 'platform_owner') return Response.json({ error: 'Platform owner access required.' }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid case update.' }, { status: 400 });
  const { id, status, ownerNote } = parsed.data;
  const admin = platformDb();
  const { data: current, error: readError } = await admin.from('support_cases' as never)
    .select('id,organization_id,owner_note,status').eq('id', id).single();
  if (readError || !current) return Response.json({ error: 'Case not found.' }, { status: 404 });
  const before = current as { organization_id: string; owner_note: string | null; status: string };
  const note = ownerNote ?? before.owner_note;
  const { error } = await admin.from('support_cases' as never).update({
    status, owner_note: note || null, responded_at: ownerNote ? new Date().toISOString() : undefined,
  } as never).eq('id', id);
  if (error) return Response.json({ error: 'Could not update the case.' }, { status: 503 });
  if (ownerNote || status !== before.status) {
    try { await notifyMerchantOwners(before.organization_id, `Support case ${status.replace('_', ' ')}`, ownerNote || `Your support case is now ${status.replace('_', ' ')}.`, id); }
    catch (notifyError) { console.error('[support] merchant notification failed', notifyError); }
  }
  return Response.json({ saved: true });
}
