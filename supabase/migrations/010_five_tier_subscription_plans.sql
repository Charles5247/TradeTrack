-- ============================================================
-- TradeTrack — Migration 010: 5-Tier Subscription Plan Restructure
-- ============================================================
--
-- Replaces the old 3-tier catalog (Basic/Standard/Business, seeded in
-- migration 003 as "Basic" ₦3,000 / "Standard" ₦5,000 / "Business" ₦8,000)
-- with a new 5-tier ladder modeled on Sortly's pricing page pattern:
--   Free → Starter → Growth [Most Popular] → Business → Enterprise
--
-- IMPORTANT: this does NOT edit migration 003's INSERT in place — that
-- migration has already been applied against live environments, and any
-- organization currently subscribed to one of the old 3 plans (via
-- subscriptions.plan_id → subscription_plans.id) must keep resolving
-- correctly. Instead we:
--   1. Deactivate (is_active = false) the 3 old rows — never DELETE them,
--      so existing subscriptions.plan_id foreign keys keep resolving.
--   2. Insert the 5 new rows as brand-new subscription_plans records.
--
-- Schema is untouched — same subscription_plans table/columns from
-- migrations 001/003 (id, name, price, currency, billing_cycle,
-- max_cashiers, max_products, max_warehouses, features, is_active,
-- is_popular, trial_days). Note: the legacy column names are
-- max_cashiers/max_warehouses (not max_users/max_locations) — the new
-- plan ladder's "max_users" and "max_locations" map onto these existing
-- columns respectively (max_cashiers → seat count, max_warehouses →
-- location count), matching how every other plan in this table already
-- uses them. -1 continues to mean "unlimited", matching the existing
-- "Business" plan's convention from migration 003.
-- ============================================================

-- ── 0. Add billing_cycle to subscriptions (not just subscription_plans) ─
-- Migration 003 added billing_cycle to subscription_plans (the catalog),
-- but the per-organization `subscriptions` row never got its own
-- billing_cycle column, so there was nowhere to persist *which* cycle a
-- given org actually checked out with. The Plans tab's Monthly/Yearly
-- toggle needs this to record what the customer chose (independent of
-- catalog row's default), matching the pattern already used for
-- subscription_plans.billing_cycle.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';

-- ── 1. Deactivate the 3 old plans (Basic/Standard/Business from 003) ──
-- Do NOT delete — organizations still on these plans (subscriptions.plan_id
-- pointing at these rows) must keep resolving via their subscription_id,
-- not a plan_id catalog lookup, and the plan row must still exist to be
-- joined/displayed (e.g. "Business (legacy, inactive)" in Overview tab).
UPDATE subscription_plans
SET is_active = false,
    is_popular = false
WHERE id IN (
  'a1111111-0000-0000-0000-000000000001'::UUID, -- Basic
  'a2222222-0000-0000-0000-000000000002'::UUID, -- Standard
  'a3333333-0000-0000-0000-000000000003'::UUID  -- Business (old)
);

-- Belt-and-braces: also deactivate by name in case any environment's
-- migration 003 ran with different generated UUIDs (defensive; matches
-- only the known legacy names so it can never touch the new "Business"
-- plan inserted below, which uses a different id space).
UPDATE subscription_plans
SET is_active = false,
    is_popular = false
WHERE name IN ('Basic', 'Standard')
  AND id NOT IN (
    'b1000000-0000-0000-0000-000000000001'::UUID,
    'b2000000-0000-0000-0000-000000000002'::UUID,
    'b3000000-0000-0000-0000-000000000003'::UUID,
    'b4000000-0000-0000-0000-000000000004'::UUID,
    'b5000000-0000-0000-0000-000000000005'::UUID
  );

-- ── 2. Insert the 5 new plans ──────────────────────────────────────────
-- Fixed UUIDs (b1.../b5...) so this migration is idempotent on re-run
-- (ON CONFLICT DO UPDATE below) and so the Zainpay billing flow /
-- payment_transactions.plan_id / subscriptions.plan_id references are
-- stable and predictable across environments.
INSERT INTO subscription_plans (
  id, name, price, currency, billing_cycle,
  max_cashiers, max_products, max_warehouses,
  features, is_active, is_popular, trial_days
)
VALUES
  (
    'b1000000-0000-0000-0000-000000000001'::UUID,
    'Free',
    0,
    'NGN',
    'monthly',
    1,      -- max_users
    50,     -- max_products
    1,      -- max_locations
    '["pos","inventory","basic_reports"]'::JSONB,
    true,
    false,
    0
  ),
  (
    'b2000000-0000-0000-0000-000000000002'::UUID,
    'Starter',
    5000,
    'NGN',
    'monthly',
    2,      -- max_users
    300,    -- max_products
    1,      -- max_locations
    '["pos","inventory","basic_reports","receipt_printing","daily_summaries"]'::JSONB,
    true,
    false,
    0
  ),
  (
    'b3000000-0000-0000-0000-000000000003'::UUID,
    'Growth',
    15000,
    'NGN',
    'monthly',
    5,      -- max_users
    1500,   -- max_products
    3,      -- max_locations
    '["pos","inventory","basic_reports","receipt_printing","daily_summaries","advanced_reports","warehouses","vendors","barcode_label_printing","low_stock_alerts"]'::JSONB,
    true,
    true,   -- ★ Most Popular
    0
  ),
  (
    'b4000000-0000-0000-0000-000000000004'::UUID,
    'Business',
    30000,
    'NGN',
    'monthly',
    12,     -- max_users
    5000,   -- max_products
    8,      -- max_locations
    '["pos","inventory","basic_reports","receipt_printing","daily_summaries","advanced_reports","warehouses","vendors","barcode_label_printing","low_stock_alerts","purchase_orders","custom_role_permissions","priority_support"]'::JSONB,
    true,
    false,
    0
  ),
  (
    'b5000000-0000-0000-0000-000000000005'::UUID,
    'Enterprise',
    0,      -- No self-serve price — "Talk to Sales" custom quote. Front-end
            -- must special-case this plan id/name to hide the price and
            -- disable the Zainpay checkout CTA (see subscriptions/page.tsx).
    'NGN',
    'monthly',
    -1,     -- max_users: unlimited
    -1,     -- max_products: unlimited
    -1,     -- max_locations: unlimited
    '["pos","inventory","basic_reports","receipt_printing","daily_summaries","advanced_reports","warehouses","vendors","barcode_label_printing","low_stock_alerts","purchase_orders","custom_role_permissions","priority_support","api_access","webhooks","dedicated_account_manager"]'::JSONB,
    true,
    false,
    0
  )
ON CONFLICT (id) DO UPDATE SET
  name           = EXCLUDED.name,
  price          = EXCLUDED.price,
  currency       = EXCLUDED.currency,
  billing_cycle  = EXCLUDED.billing_cycle,
  max_cashiers   = EXCLUDED.max_cashiers,
  max_products   = EXCLUDED.max_products,
  max_warehouses = EXCLUDED.max_warehouses,
  features       = EXCLUDED.features,
  is_active      = EXCLUDED.is_active,
  is_popular     = EXCLUDED.is_popular,
  trial_days     = EXCLUDED.trial_days;

-- ── 3. Yearly pricing is NOT stored as separate rows ────────────────────
-- Per spec, this migration seeds exactly 5 rows (one per tier), matching
-- "replace the 3 seeded rows ... with 5 rows — keep the same schema, just
-- new data". Each plan's `price` column holds the MONTHLY rate and
-- `billing_cycle = 'monthly'`. The Plans tab's Monthly/Yearly toggle
-- computes the annual price and "save ₦X" line client-side using an
-- exact 20%-off-annual formula (monthly × 12 × 0.8), which reproduces
-- the spec's numbers exactly:
--   Starter:  ₦5,000  × 12 × 0.8 = ₦48,000/yr  (save ₦12,000)
--   Growth:   ₦15,000 × 12 × 0.8 = ₦144,000/yr (save ₦36,000)
--   Business: ₦30,000 × 12 × 0.8 = ₦288,000/yr (save ₦72,000)
-- See computeYearlyPricing() in subscriptions/page.tsx. When the user
-- selects "Yearly" and checks out, the client submits
-- billing_cycle: 'yearly' on the subscriptions/payment_transactions row
-- (existing columns, unchanged) — the *plan catalog* itself stays a
-- single canonical monthly-priced row per tier.
--
-- ============================================================
-- Verification queries (run manually, not part of the migration):
--
--   -- New active catalog should show exactly 5 rows, all is_active = true:
--   SELECT name, price, billing_cycle, is_active, is_popular
--   FROM subscription_plans
--   WHERE id::text LIKE 'b%'
--   ORDER BY price;
--
--   -- Old plans should be deactivated but still present (not deleted):
--   SELECT id, name, is_active FROM subscription_plans
--   WHERE id IN (
--     'a1111111-0000-0000-0000-000000000001',
--     'a2222222-0000-0000-0000-000000000002',
--     'a3333333-0000-0000-0000-000000000003'
--   );
--
--   -- Any organization still on an old plan must still resolve fine via
--   -- its subscription_id (not a fresh plan_id catalog lookup):
--   SELECT s.id, s.organization_id, s.plan_id, s.status, p.name, p.is_active
--   FROM subscriptions s
--   JOIN subscription_plans p ON p.id = s.plan_id
--   WHERE p.is_active = false;
-- ============================================================
