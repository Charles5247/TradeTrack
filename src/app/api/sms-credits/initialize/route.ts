import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getZainpayConfig } from '@/lib/zainpay-config';
import { checkoutUrl, paymentAdmin } from '@/lib/subscriptions/zainpay-checkout';

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = paymentAdmin();
  const { data: { user } } = await admin.auth.getUser(token);
  const { data: profile } = user ? await admin.from('users').select('organization_id,role,phone').eq('id', user.id).maybeSingle() : { data: null };
  if (!user || !profile?.organization_id || profile.role !== 'business_owner') return NextResponse.json({ error: 'Only the business owner can buy SMS credits' }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { credits?: number; mobile?: string };
  const credits = Number(body.credits);
  const mobile = String(body.mobile || profile.phone || '').replace(/[\s()-]/g, '');
  if (!Number.isSafeInteger(credits) || credits < 10 || credits > 100000 || !/^\+?\d{10,15}$/.test(mobile)) return NextResponse.json({ error: 'Enter 10–100,000 credits and a valid payment phone number' }, { status: 400 });
  const { data: settings } = await admin.from('notification_channel_settings').select('sms_unit_price_kobo').eq('organization_id', profile.organization_id).maybeSingle();
  const unitPrice = Number(settings?.sms_unit_price_kobo);
  const amount = credits * unitPrice;
  if (!Number.isSafeInteger(amount) || amount <= 0) return NextResponse.json({ error: 'The SMS price has not been configured' }, { status: 503 });
  const config = getZainpayConfig();
  const zainbox = config.defaultZainbox || config.zainboxCode;
  if (!config.publicKey || !zainbox || !process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_ENV === 'production' && config.mode !== 'live')) return NextResponse.json({ error: 'Live payment gateway is not configured' }, { status: 503 });
  const reference = `TSMS-${randomUUID()}`;
  const { error: saveError } = await admin.from('sms_credit_checkouts').insert({ reference, organization_id: profile.organization_id, user_id: user.id, credits, amount_kobo: amount, mode: config.mode, zainbox_code: zainbox });
  if (saveError) return NextResponse.json({ error: 'Unable to save checkout; no payment was started' }, { status: 503 });
  const callback = new URL('/api/sms-credits/verify', process.env.NEXT_PUBLIC_APP_URL);
  callback.searchParams.set('txnRef', reference); callback.searchParams.set('redirect', '1');
  const response = await fetch(`${config.baseUrl}/zainbox/card/initialize/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.publicKey}` }, body: JSON.stringify({ amount: String(amount), txnRef: reference, emailAddress: user.email, mobileNumber: mobile, zainboxCode: zainbox, callBackUrl: callback.href }), signal: AbortSignal.timeout(20000) }).catch(() => null);
  const url = response?.ok ? checkoutUrl(await response.json()) : null;
  if (!url) return NextResponse.json({ error: 'Zainpay is temporarily unavailable. Retry this checkout; do not make another payment.' }, { status: 503 });
  return NextResponse.json({ paymentUrl: url, reference, credits, amount: amount / 100 });
}
