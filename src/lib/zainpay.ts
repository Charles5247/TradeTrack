/**
 * TradeTrack — Zainpay integration helpers (server-side only).
 *
 * This module must NEVER be imported from a client component / anything
 * that ends up in the browser bundle — it uses the Zainpay secret key and
 * talks directly to Zainpay's API. It is intended to be called from:
 *   - `POST /api/merchants/onboard` (create a dedicated virtual account for
 *     a newly-onboarded merchant organization)
 *   - `POST /api/webhooks/zainpay` (reconciliation, already separate)
 *
 * Zainpay concepts used here:
 *   - Zainbox: a collection "box" that groups virtual accounts under one
 *     of TradeTrack's own Zainpay merchant accounts. We use a single
 *     Zainbox (`ZAINPAY_ZAINBOX_CODE`) for all subscription collections.
 *   - Virtual account (NUBAN): a dedicated bank account number issued per
 *     merchant organization. Any transfer into that NUBAN is reconciled by
 *     the webhook against `organizations.zainpay_virtual_account_number`
 *     instead of parsing free-text transfer narrations.
 */

const ZAINPAY_BASE_URL     = process.env.ZAINPAY_BASE_URL     ?? 'https://sandbox.zainpay.ng';
const ZAINPAY_SECRET_KEY   = process.env.ZAINPAY_SECRET_KEY   ?? '';
const ZAINPAY_ZAINBOX_CODE = process.env.ZAINPAY_ZAINBOX_CODE ?? '';

export interface ZainpayVirtualAccount {
  accountNumber: string;
  bankName:      string;
  accountName:   string;
  customerRef:   string;
}

export class ZainpayNotConfiguredError extends Error {
  constructor() {
    super(
      'Zainpay is not configured (ZAINPAY_SECRET_KEY / ZAINPAY_ZAINBOX_CODE ' +
      'missing). Merchant onboarding will proceed WITHOUT a dedicated ' +
      'virtual account — it can be created later once Zainpay credentials ' +
      'are added.'
    );
    this.name = 'ZainpayNotConfiguredError';
  }
}

/** Whether Zainpay credentials are present in the environment. */
export function isZainpayConfigured(): boolean {
  return Boolean(ZAINPAY_SECRET_KEY && ZAINPAY_ZAINBOX_CODE);
}

/**
 * Create a dedicated Zainpay virtual account (NUBAN) for a newly onboarded
 * merchant organization, used to collect and auto-reconcile subscription
 * payments. Throws `ZainpayNotConfiguredError` if credentials are missing
 * so callers can decide to proceed onboarding without payment automation
 * (non-fatal — plan/payment setup can be completed later).
 */
export async function createMerchantVirtualAccount(params: {
  organizationId: string;
  businessName:   string;
  contactEmail:   string;
  contactPhone?:  string | null;
}): Promise<ZainpayVirtualAccount> {
  if (!isZainpayConfigured()) {
    throw new ZainpayNotConfiguredError();
  }

  // customerRef must be stable + unique per organization so re-running
  // onboarding logic (e.g. a retry) doesn't create duplicate accounts.
  const customerRef = `tt-org-${params.organizationId}`;

  const res = await fetch(`${ZAINPAY_BASE_URL}/virtual-account/customer`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${ZAINPAY_SECRET_KEY}`,
    },
    body: JSON.stringify({
      firstName:    params.businessName,
      lastName:     'Merchant',
      email:        params.contactEmail,
      mobileNumber: params.contactPhone ?? '',
      zainboxCode:  ZAINPAY_ZAINBOX_CODE,
      customerRef,
      title:        params.businessName,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Zainpay virtual account creation failed (${res.status}): ${body}`);
  }

  const json = await res.json() as {
    code?: string;
    data?: {
      accountNumber?: string;
      bankName?:      string;
      accountName?:   string;
    };
  };

  if (json.code !== '00' || !json.data?.accountNumber) {
    throw new Error(`Zainpay virtual account creation returned unexpected response: ${JSON.stringify(json)}`);
  }

  return {
    accountNumber: json.data.accountNumber,
    bankName:      json.data.bankName ?? 'Zainpay',
    accountName:   json.data.accountName ?? params.businessName,
    customerRef,
  };
}
