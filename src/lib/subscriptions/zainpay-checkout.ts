import { createClient } from '@supabase/supabase-js';
import { getZainpayConfig } from '@/lib/zainpay-config';

export function paymentAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
export interface CheckoutSnapshot {
  reference: string; amount_kobo: number; mode: string; zainbox_code: string; status: string;
}
/** v2 uses gross depositedAmount in kobo; never infer units or use the net amount. */
export function matchesCheckout(response: unknown, checkout: CheckoutSnapshot): boolean {
  if (!response || typeof response !== 'object') return false;
  const result = response as Record<string, unknown>;
  if (result.code !== '00' || !result.data || typeof result.data !== 'object') return false;
  const data = result.data as Record<string, unknown>;
  const amount = String(data.depositedAmount ?? '');
  return /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount))
    && Number(amount) === Number(checkout.amount_kobo)
    && data.txnRef === checkout.reference && data.zainboxCode === checkout.zainbox_code
    && data.txnType === 'deposit';
}
export function checkoutUrl(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const result = response as { code?: string; data?: string | { authorizationUrl?: string; paymentUrl?: string } };
  if (result.code !== '00') return null;
  const value = typeof result.data === 'string' ? result.data : result.data?.authorizationUrl ?? result.data?.paymentUrl;
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export async function verifyCheckout(reference: string) {
  if (!/^TT-[0-9a-f-]{36}$/i.test(reference)) throw new Error('Invalid checkout reference');
  const admin = paymentAdmin();
  const { data, error } = await admin.from('subscription_checkouts').select('*').eq('reference', reference).maybeSingle();
  if (error) throw new Error('Checkout lookup unavailable');
  if (!data) throw new Error('Checkout not found');
  const checkout = data as CheckoutSnapshot;
  const config = getZainpayConfig();
  if (checkout.mode !== config.mode || checkout.zainbox_code !== (config.defaultZainbox || config.zainboxCode) || !config.publicKey) throw new Error('Checkout gateway configuration changed');
  if (checkout.status === 'paid') return { verified: true, subscriptionActivated: true, alreadyProcessed: true };
  const response = await fetch(`${config.baseUrl}/virtual-account/wallet/deposit/verify/v2/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${config.publicKey}` }, cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Payment verification unavailable; retry shortly');
  const result: unknown = await response.json();
  if (!matchesCheckout(result, checkout)) return { verified: false, subscriptionActivated: false };
  if (config.mode === 'test') return { verified: true, subscriptionActivated: false, sandbox: true };
  const { error: saveError } = await admin.rpc('finalize_subscription_checkout', {
    p_reference: reference, p_amount_kobo: checkout.amount_kobo, p_provider_response: result,
  });
  if (saveError) throw new Error('Payment confirmed; activation pending. Retry verification, do not pay again.');
  return { verified: true, subscriptionActivated: true };
}
