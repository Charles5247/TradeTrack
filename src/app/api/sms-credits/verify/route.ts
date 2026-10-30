import { NextRequest, NextResponse } from 'next/server';
import { getZainpayConfig } from '@/lib/zainpay-config';
import { matchesCheckout, paymentAdmin } from '@/lib/subscriptions/zainpay-checkout';

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get('txnRef') || '';
  const redirect = request.nextUrl.searchParams.get('redirect') === '1';
  const destination = new URL('/settings?tab=notifications', process.env.NEXT_PUBLIC_APP_URL || request.url);
  try {
    if (!/^TSMS-[0-9a-f-]{36}$/i.test(reference)) throw new Error('Invalid checkout reference');
    const admin = paymentAdmin();
    const { data: checkout, error } = await admin.from('sms_credit_checkouts').select('*').eq('reference', reference).maybeSingle();
    if (error || !checkout) throw new Error('Checkout not found');
    if (checkout.status === 'paid') { destination.searchParams.set('smsCredits', 'success'); return redirect ? NextResponse.redirect(destination, 303) : NextResponse.json({ verified: true, alreadyProcessed: true }); }
    const config = getZainpayConfig();
    if (!config.publicKey || checkout.mode !== config.mode || checkout.zainbox_code !== (config.defaultZainbox || config.zainboxCode)) throw new Error('Checkout gateway configuration changed');
    const response = await fetch(`${config.baseUrl}/virtual-account/wallet/deposit/verify/v2/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${config.publicKey}` }, cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const result: unknown = response.ok ? await response.json() : null;
    if (!matchesCheckout(result, checkout)) throw new Error('Payment is not confirmed yet');
    if (config.mode !== 'live') { destination.searchParams.set('smsCredits', 'sandbox'); return redirect ? NextResponse.redirect(destination, 303) : NextResponse.json({ verified: true, sandbox: true }); }
    const { data, error: finalizeError } = await admin.rpc('finalize_sms_credit_checkout', { p_reference: reference, p_amount_kobo: checkout.amount_kobo });
    if (finalizeError) throw new Error('Payment confirmed; credit activation is pending');
    destination.searchParams.set('smsCredits', 'success');
    return redirect ? NextResponse.redirect(destination, 303) : NextResponse.json({ verified: true, ...data });
  } catch (error) {
    destination.searchParams.set('smsCredits', 'pending');
    return redirect ? NextResponse.redirect(destination, 303) : NextResponse.json({ verified: false, error: error instanceof Error ? error.message : 'Verification unavailable' }, { status: 503 });
  }
}
