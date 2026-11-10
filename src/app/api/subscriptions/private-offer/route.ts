import { NextRequest, NextResponse } from 'next/server';
import { paymentAdmin } from '@/lib/subscriptions/zainpay-checkout';

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = paymentAdmin();
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await admin.from('users').select('organization_id,role').eq('id', user.id).single();
  if (!profile?.organization_id || profile.role !== 'business_owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data: offer, error } = await admin.from('private_subscription_offers')
    .select('plan_id,monthly_price,plan:subscription_plans(id,name,max_cashiers,max_products,max_warehouses,features)')
    .eq('organization_id', profile.organization_id).eq('is_active', true).maybeSingle();
  if (error) return NextResponse.json({ error: 'Offer unavailable' }, { status: 503 });
  return NextResponse.json({ offer: offer || null });
}
