import { NextRequest, NextResponse } from 'next/server';
import { paymentAdmin } from '@/lib/subscriptions/zainpay-checkout';

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = paymentAdmin();
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile, error: profileError } = await admin.from('users')
    .select('organization_id,role').eq('id', user.id).single();
  if (profileError || !profile?.organization_id || profile.role !== 'business_owner')
    return NextResponse.json({ error: 'Only the business owner can check payments' }, { status: 403 });
  const { data: checkout, error } = await admin.from('subscription_checkouts')
    .select('reference,amount_kobo,created_at')
    .eq('organization_id', profile.organization_id).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load pending payment' }, { status: 503 });
  return NextResponse.json({ checkout }, { headers: { 'Cache-Control': 'no-store' } });
}
