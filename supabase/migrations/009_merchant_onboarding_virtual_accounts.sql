-- ============================================================
-- Migration 009: Merchant Onboarding + Zainpay Virtual Accounts
-- ============================================================
-- 1. Track which platform_owner onboarded a merchant + the resulting
--    business_owner user id, so the merchants table and users table
--    are linked without guessing by organization_id alone.
-- 2. Add Zainpay dedicated-virtual-account fields to `organizations`
--    (one virtual account per merchant organization, used for
--    automatic subscription-payment reconciliation instead of
--    free-text reference parsing).
-- 3. Add plan renewal tracking fields already partially covered by
--    `subscriptions.expires_at` — add a convenience denormalized
--    `next_renewal_at` + `last_payment_amount` on organizations for
--    fast dashboard reads (platform_owner merchant list), refreshed
--    by the Zainpay webhook handler.
-- ============================================================

-- ── 1. Merchant ↔ business_owner linkage ────────────────────────
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS business_owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS onboarded_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_merchants_business_owner_user_id ON public.merchants(business_owner_user_id);

-- ── 2. Zainpay dedicated virtual account per merchant org ───────
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS zainpay_virtual_account_number TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS zainpay_virtual_account_bank   TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS zainpay_virtual_account_name    TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS zainpay_customer_reference      TEXT UNIQUE;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS next_renewal_at                 TIMESTAMPTZ;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS last_payment_amount             NUMERIC(12,2);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS last_payment_at                 TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_zainpay_vacct ON public.organizations(zainpay_virtual_account_number);
CREATE INDEX IF NOT EXISTS idx_organizations_zainpay_customer_ref ON public.organizations(zainpay_customer_reference);

COMMENT ON COLUMN public.organizations.zainpay_virtual_account_number IS
  'Dedicated Zainpay virtual account (NUBAN) issued to this merchant org for subscription-payment reconciliation. Populated by /api/merchants/onboard at creation time via the Zainpay virtual-account API, matched by the webhook receiver on incoming deposit.notification events.';
COMMENT ON COLUMN public.organizations.zainpay_customer_reference IS
  'Stable reference tying this organization to a Zainpay customer/virtual-account record — used as the idempotent lookup key instead of parsing free-text transfer narrations.';

-- ── 3. Extend payment_transactions to record which virtual account a
--       deposit landed on (for auditability / debugging reconciliation) ─
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS virtual_account_number TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_vacct ON payment_transactions(virtual_account_number);

-- ── 4. RLS: only platform_owner and the service role ever touch the
--       zainpay_* / next_renewal_at columns; existing org_update policy
--       (is_admin_or_above() AND own org) already permits a
--       business_owner/admin to update THEIR OWN org row for normal
--       settings (name, address, phone, currency) — that is unavoidable
--       with column-less RLS, so the API/service layer (not RLS) is
--       responsible for stripping zainpay_*/next_renewal_at/
--       last_payment_* fields out of any client-writable update payload.
--       (Documented here since Postgres RLS is row-level, not
--       column-level, and Supabase's client SDK would otherwise let an
--       org's own admin overwrite these fields if the app code allowed
--       it — the app code (settings page) must never expose them.)
