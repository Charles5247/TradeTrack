import { NextRequest, NextResponse } from 'next/server';
import { decryptCardToken } from '@/lib/subscriptions/card-renewal';
import { paymentAdmin, verifyCheckout } from '@/lib/subscriptions/zainpay-checkout';
import { getZainpayConfig } from '@/lib/zainpay-config';

type RenewalClaim = {
  organization_id: string; reference: string; encrypted_token: string;
  amount_kobo: number; mobile_number: string; email_address: string;
  zainbox_code: string; mode: string;
};

async function clearSettledReference(admin: ReturnType<typeof paymentAdmin>, organizationId: string, reference: string) {
  const { data: mandate } = await admin.from('subscription_card_mandates')
    .select('status').eq('organization_id', organizationId).eq('pending_reference', reference).maybeSingle();
  if (!mandate) return;
  await admin.from('subscription_card_mandates').update({
    pending_reference: null, charge_requested_at: null, last_error: null,
    status: mandate.status === 'disabled' ? 'disabled' : 'active', updated_at: new Date().toISOString(),
  }).eq('organization_id', organizationId).eq('pending_reference', reference).eq('status', mandate.status);
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const config = getZainpayConfig();
  if (config.mode !== 'live' || !config.publicKey || !process.env.SUBSCRIPTION_CARD_TOKEN_KEY)
    return NextResponse.json({ error: 'Live card renewal is not configured' }, { status: 503 });
  const admin = paymentAdmin();
  let settled = 0;
  const { data: pending, error: pendingError } = await admin.from('subscription_card_mandates')
    .select('organization_id,pending_reference').not('pending_reference', 'is', null)
    .not('charge_requested_at', 'is', null).limit(20);
  if (pendingError) return NextResponse.json({ error: 'Renewal queue unavailable' }, { status: 503 });
  for (const item of pending || []) {
    try {
      const outcome = await verifyCheckout(item.pending_reference!);
      if (outcome.subscriptionActivated) {
        await clearSettledReference(admin, item.organization_id, item.pending_reference!);
        settled++;
      }
    } catch { /* A provider result can be delayed; never submit a second charge. */ }
  }

  const { data, error } = await admin.rpc('claim_due_card_renewals', { p_limit: 20 });
  if (error) return NextResponse.json({ error: 'Could not reserve renewals' }, { status: 503 });
  let submitted = 0;
  let unresolved = 0;
  for (const claim of (data || []) as RenewalClaim[]) {
    const { data: reserved, error: reserveError } = await admin.from('subscription_card_mandates')
      .update({ charge_requested_at: new Date().toISOString() })
      .eq('organization_id', claim.organization_id).eq('pending_reference', claim.reference)
      .eq('status', 'active').is('charge_requested_at', null)
      .select('organization_id').maybeSingle();
    if (reserveError || !reserved) continue;
    try {
      const cardToken = decryptCardToken(claim.encrypted_token);
      const callback = new URL('/api/webhooks/zainpay', process.env.NEXT_PUBLIC_APP_URL!);
      const response = await fetch(`${config.baseUrl}/zainbox/card/recurring/purchase`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.publicKey}` },
        body: JSON.stringify({ amount: String(Number(claim.amount_kobo) / 100), txnRef: claim.reference,
          mobileNumber: claim.mobile_number, zainboxCode: claim.zainbox_code,
          emailAddress: claim.email_address, callBackUrl: callback.href, cardToken }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) submitted++;
      else {
        unresolved++;
        await admin.from('subscription_card_mandates').update({
          last_error: `Provider returned HTTP ${response.status}`,
          ...(response.status >= 400 && response.status < 500 ? { status: 'action_required' } : {}),
        })
          .eq('organization_id', claim.organization_id).eq('pending_reference', claim.reference);
      }
      const outcome = await verifyCheckout(claim.reference);
      if (outcome.subscriptionActivated) {
        await clearSettledReference(admin, claim.organization_id, claim.reference);
        settled++;
      }
    } catch (error) {
      unresolved++;
      console.error('[billing] Renewal result needs reconciliation', {
        reference: claim.reference, reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  return NextResponse.json({ claimed: data?.length || 0, submitted, settled, unresolved });
}
