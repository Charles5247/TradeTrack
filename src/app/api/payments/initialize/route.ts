import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getZainpayConfig } from '@/lib/zainpay-config';
import { BILLING_MONTHS, billingPrice, type BillingCycle } from '@/lib/subscriptions/billing-cycle';
import { paymentAdmin, checkoutUrl } from '@/lib/subscriptions/zainpay-checkout';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = paymentAdmin();
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { data: profile, error: profileError } = await admin.from('users').select('organization_id,role,phone').eq('id', user.id).single();
    if (profileError || !profile?.organization_id || profile.role !== 'business_owner') return NextResponse.json({ error: 'Only the business owner can purchase a subscription' }, { status: 403 });
    let body: { planId?: string; billingCycle?: string; mobile?: string };
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!body || typeof body.planId !== 'string' || !Object.hasOwn(BILLING_MONTHS, body.billingCycle || '')) return NextResponse.json({ error: 'Choose a plan and billing period' }, { status: 400 });
    const mobile = (typeof body.mobile === 'string' ? body.mobile : profile.phone || '').replace(/[\s()-]/g, '');
    if (!/^\+?\d{10,15}$/.test(mobile)) return NextResponse.json({ error: 'Enter a valid phone number for payment' }, { status: 400 });
    const { data: plan, error: planError } = await admin.from('subscription_plans').select('id,name,price,currency,billing_cycle,is_active').eq('id', body.planId).single();
    if (planError || !plan?.is_active || plan.billing_cycle !== 'monthly' || plan.currency !== 'NGN' || Number(plan.price) <= 0 || /trial|enterprise|free/i.test(plan.name)) return NextResponse.json({ error: 'This plan is not available for checkout' }, { status: 400 });
    const config = getZainpayConfig();
    const zainbox = config.defaultZainbox || config.zainboxCode;
    if (!config.publicKey || !zainbox || !process.env.NEXT_PUBLIC_APP_URL) return NextResponse.json({ error: 'Payment gateway is not configured' }, { status: 503 });
    if (process.env.VERCEL_ENV === 'production' && config.mode !== 'live') return NextResponse.json({ error: 'Live subscription payments are not enabled yet' }, { status: 503 });
    const amount = Math.round(billingPrice(Number(plan.price), body.billingCycle as BillingCycle) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !user.email) return NextResponse.json({ error: 'Invalid checkout details' }, { status: 400 });
    const reference = `TT-${randomUUID()}`;
    const { error: saveError } = await admin.from('subscription_checkouts').insert({
      reference, organization_id: profile.organization_id, user_id: user.id, plan_id: plan.id,
      plan_name: plan.name, billing_cycle: body.billingCycle, amount_kobo: amount, mode: config.mode, zainbox_code: zainbox,
    });
    if (saveError) return NextResponse.json({ error: 'Unable to save checkout; no payment was started' }, { status: 503 });
    const callback = new URL('/api/payments/verify', process.env.NEXT_PUBLIC_APP_URL);
    callback.searchParams.set('txnRef', reference);
    callback.searchParams.set('redirect', '1');
    const providerPayload = JSON.stringify({ amount: String(amount), txnRef: reference, emailAddress: user.email,
      mobileNumber: mobile, zainboxCode: zainbox, callBackUrl: callback.href });
    let providerStatus = 503;
    let url: string | null = null;
    for (let attempt = 0; attempt < 3 && !url; attempt += 1) {
      try {
        const response = await fetch(`${config.baseUrl}/zainbox/card/initialize/payment`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.publicKey}` },
          body: providerPayload, signal: AbortSignal.timeout(20000),
        });
        providerStatus = response.status;
        if (response.ok) url = checkoutUrl(await response.json());
        if (response.status < 500) break;
      } catch { providerStatus = 503; }
      if (!url && attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
    if (!url) {
      console.error('[Zainpay] checkout initialization unavailable', { providerStatus, reference });
      return NextResponse.json({ error: 'Zainpay is temporarily unavailable. Retry this checkout; do not make another payment.' }, { status: 503 });
    }
    return NextResponse.json({ success: true, txnRef: reference, paymentUrl: url, amount: amount / 100, currency: 'NGN' });
  } catch {
    return NextResponse.json({ error: 'Unable to start payment. Please retry.' }, { status: 503 });
  }
}
export async function GET() {
  const config = getZainpayConfig();
  return NextResponse.json({ gateway: 'Zainpay', environment: config.mode, configured: Boolean(config.publicKey && (config.defaultZainbox || config.zainboxCode)) });
}
