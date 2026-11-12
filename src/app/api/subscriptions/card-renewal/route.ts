import { NextRequest, NextResponse } from 'next/server';
import { paymentAdmin } from '@/lib/subscriptions/zainpay-checkout';

async function owner(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const admin = paymentAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await admin.from('users')
    .select('organization_id,role,status').eq('id', user.id).maybeSingle();
  return profile?.role === 'business_owner' && profile.status === 'active' && profile.organization_id
    ? { admin, organizationId: profile.organization_id } : null;
}

export async function GET(request: NextRequest) {
  const context = await owner(request);
  if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await context.admin.from('subscription_card_mandates')
    .select('status,billing_cycle,amount_kobo,consented_at,last_error')
    .eq('organization_id', context.organizationId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Renewal status unavailable' }, { status: 503 });
  return NextResponse.json({ renewal: data || null });
}

export async function DELETE(request: NextRequest) {
  const context = await owner(request);
  if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { error } = await context.admin.from('subscription_card_mandates')
    .delete().eq('organization_id', context.organizationId).is('pending_reference', null);
  if (error) return NextResponse.json({ error: 'Could not stop automatic renewal' }, { status: 503 });
  const { data: pending } = await context.admin.from('subscription_card_mandates')
    .select('organization_id').eq('organization_id', context.organizationId).maybeSingle();
  if (pending) return NextResponse.json({ error: 'A renewal is already being processed. Check its result before disabling.' }, { status: 409 });
  return NextResponse.json({ renewal: null });
}
