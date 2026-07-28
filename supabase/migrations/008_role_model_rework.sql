-- ============================================================
-- Migration 008: Role Model Rework
-- super_admin/owner/admin/cashier  →  platform_owner/business_owner/admin/cashier
-- ============================================================
-- BACKGROUND
-- The previous model conflated two very different concepts under
-- one word, "owner":
--   - 'super_admin' = TradeTrack's own cross-organization god-mode
--   - 'owner'       = a *platform-level* role (merchant/subscription
--                      dashboard) that was ALSO effectively cross-org
--                      (its RLS checks always included 'super_admin'
--                      alongside it, e.g. `role IN ('owner','super_admin')`)
-- Neither of these represented "the merchant who owns their own shop"
-- — that concept did not exist as a role at all. Every new merchant
-- was previously just handed a `merchants` row inside the CREATOR's
-- own organization, with no dedicated login of their own.
--
-- NEW MODEL
--   platform_owner  — cross-organization (TradeTrack staff only).
--                      Replaces BOTH 'super_admin' and 'owner'.
--                      Never auto-granted; only ever created manually
--                      for TradeTrack's own internal accounts.
--   business_owner  — NEW role. Single-organization. Full control
--                      within their own org only. Auto-created when
--                      a merchant is onboarded (see 009_merchant_onboarding.sql
--                      and the /api/merchants/onboard route). Can manage
--                      admin/cashier accounts within their own org.
--   admin           — unchanged. Single-organization caretaker role.
--   cashier         — unchanged. Single-organization, POS/sales only.
--
-- MIGRATION STRATEGY FOR EXISTING ROWS
--   'super_admin' → 'platform_owner'   (cross-org concept preserved)
--   'owner'       → 'platform_owner'   (platform-level dashboard concept
--                                        preserved; existing "Owner" demo
--                                        accounts become platform staff)
--   'admin', 'cashier' → unchanged
-- Any FUTURE merchant onboarded via the new flow gets 'business_owner'
-- from day one — this migration does not need to (and cannot, since no
-- such accounts exist yet) reassign anyone TO 'business_owner'.
-- ============================================================

-- ── 1. Reassign existing role values ───────────────────────────
UPDATE users SET role = 'platform_owner' WHERE role IN ('super_admin', 'owner');

-- ── 2. Widen then narrow the CHECK constraint to the new 4 roles ─
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('platform_owner', 'business_owner', 'admin', 'cashier'));

-- ── 3. Replace RLS helper functions ────────────────────────────
-- is_super_admin() is renamed to is_platform_owner() (same cross-org
-- semantics, new name). A kept SQL-callable alias is NOT retained —
-- every call site in policies below is updated to the new name so
-- there is no ambiguity about who has cross-org access.
CREATE OR REPLACE FUNCTION is_platform_owner()
RETURNS BOOLEAN AS $$
  SELECT role = 'platform_owner' FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- New helper: true for business_owner OR admin (i.e. "can manage this
-- org's operational data"), scoped to their own org via get_user_org_id()
-- at the call site — this function only tells you the ROLE qualifies,
-- not that the org matches; policies must still AND it with an org check.
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN AS $$
  SELECT role IN ('platform_owner', 'business_owner', 'admin') FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- New helper: true only for business_owner (used to gate
-- subscription/Zainpay UI and merchant-onboarding-created-user actions
-- to the merchant's own top-level account, excluding admin/cashier).
CREATE OR REPLACE FUNCTION is_business_owner()
RETURNS BOOLEAN AS $$
  SELECT role = 'business_owner' FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- get_user_org_id() and get_user_role() are unchanged in behavior —
-- re-declared here only for completeness/history, not because they
-- need new logic.
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── 4. organizations / users policies (002_rls_policies.sql) ────
DROP POLICY IF EXISTS "org_select" ON organizations;
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (
    id = get_user_org_id() OR is_platform_owner()
  );

DROP POLICY IF EXISTS "org_insert" ON organizations;
CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (is_platform_owner());
-- NOTE: business_owner accounts are created via the service-role
-- onboarding API route (bypasses RLS), never a direct client insert —
-- so restricting org_insert to platform_owner alone is intentional and
-- does not block onboarding.

DROP POLICY IF EXISTS "org_update" ON organizations;
CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (
    id = get_user_org_id() AND is_admin_or_above()
  );
-- platform_owner has no org_id of their own tying them to a merchant's
-- org, so this does NOT grant platform_owner write access into a
-- merchant's organizations row — by design (spec item: "platform_owner
-- dashboard has no write access to any individual merchant's
-- operational data").

DROP POLICY IF EXISTS "users_select_own_org" ON users;
CREATE POLICY "users_select_own_org" ON users
  FOR SELECT USING (
    organization_id = get_user_org_id() OR is_platform_owner()
  );

DROP POLICY IF EXISTS "users_insert_super_admin" ON users;
CREATE POLICY "users_insert_platform_owner" ON users
  FOR INSERT WITH CHECK (is_platform_owner());
-- Same note as org_insert: business_owner/admin/cashier account creation
-- during onboarding goes through the service-role API route, not this
-- policy. This policy only governs direct client-side inserts (e.g. a
-- platform_owner using Supabase client directly), which remains
-- restricted to platform_owner.

DROP POLICY IF EXISTS "users_update_admin" ON users;
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (
    (organization_id = get_user_org_id() AND is_admin_or_above())
    OR is_platform_owner()
    OR id = auth.uid()
  );

DROP POLICY IF EXISTS "users_delete_super_admin" ON users;
CREATE POLICY "users_delete_platform_owner" ON users
  FOR DELETE USING (is_platform_owner());

-- ── 5. All remaining is_super_admin()/is_admin_or_above() call sites in
--       002_rls_policies.sql already reference is_admin_or_above() by
--       function name (not literal role strings), and that function has
--       been redefined above with the new role set — so categories,
--       suppliers, products, warehouses, inventory, inventory_movements,
--       warehouse_transfers, customers, sales, sale_items,
--       vendor_transactions, vendor_transaction_items, audit_logs,
--       notifications and settings policies all pick up the new
--       semantics automatically without needing individual DROP/CREATE
--       here. Only policies that used the now-removed is_super_admin()
--       function name directly need updating:
DROP POLICY IF EXISTS "plans_select_all" ON subscription_plans;
CREATE POLICY "plans_select_all" ON subscription_plans
  FOR SELECT USING (is_active = true OR is_platform_owner() OR get_user_role() = 'business_owner');
-- (business_owner needs to see inactive plans too, matching the old
-- 'owner' grant from 007_feature_updates.sql — a merchant might be on a
-- plan that was since deactivated and needs to still see it named.)

DROP POLICY IF EXISTS "plans_manage_owner_or_super_admin" ON subscription_plans;
DROP POLICY IF EXISTS "plans_manage_super_admin" ON subscription_plans;
CREATE POLICY "plans_manage_platform_owner" ON subscription_plans
  FOR ALL USING (is_platform_owner())
  WITH CHECK (is_platform_owner());
-- IMPORTANT CHANGE: subscription PLAN definitions (create/edit price/
-- delete packages) are now platform_owner-only. Under the old model,
-- 'owner' (a merchant-side role in practice, per the README's own
-- description) could edit the global plan catalog — that was itself a
-- cross-tenant privilege leak once 'owner' is properly understood as
-- "the merchant's account". Plan catalog management belongs to
-- TradeTrack (platform_owner) alone; business_owner may only SELECT
-- plans and choose one for their own org (see subscriptions policy
-- below), not edit the catalog.

DROP POLICY IF EXISTS "subscriptions_manage_super_admin" ON subscriptions;
CREATE POLICY "subscriptions_manage_platform_owner" ON subscriptions
  FOR ALL USING (is_platform_owner());

DROP POLICY IF EXISTS "subscriptions_select_own_org" ON subscriptions;
CREATE POLICY "subscriptions_select_own_org" ON subscriptions
  FOR SELECT USING (
    organization_id = get_user_org_id() OR is_platform_owner()
  );

-- business_owner may self-service upgrade/select a plan for their OWN
-- org (used by the existing subscriptions page "select plan" flow).
DROP POLICY IF EXISTS "subscriptions_business_owner_manage_own" ON subscriptions;
CREATE POLICY "subscriptions_business_owner_manage_own" ON subscriptions
  FOR ALL USING (
    organization_id = get_user_org_id() AND get_user_role() = 'business_owner'
  )
  WITH CHECK (
    organization_id = get_user_org_id() AND get_user_role() = 'business_owner'
  );

-- ── 6. Merchants / webhook_logs / invoices / merchant_device_limits
--       (004_owner_payments_merchants.sql, 006_fix_role_policies.sql) ──
DROP POLICY IF EXISTS "merchants_select_own_org" ON public.merchants;
DROP POLICY IF EXISTS "merchants_insert_owner" ON public.merchants;
DROP POLICY IF EXISTS "merchants_insert_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_update_owner" ON public.merchants;
DROP POLICY IF EXISTS "merchants_update_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_delete_owner" ON public.merchants;
DROP POLICY IF EXISTS "merchants_delete_super_admin" ON public.merchants;

-- Only platform_owner can see the CROSS-ORG merchant directory (the
-- /merchants and /admin platform dashboards). A business_owner sees only
-- their OWN org's merchant row (their own business profile), not anyone
-- else's — the previous "owner sees all merchants" behavior was exactly
-- the cross-tenant leak this rework closes.
CREATE POLICY "merchants_select_own_org_or_platform" ON public.merchants
  FOR SELECT USING (
    organization_id = get_user_org_id()
    OR is_platform_owner()
  );

-- Only platform_owner creates merchants directly via this policy path.
-- (The real onboarding flow uses the service-role API route, which
-- bypasses RLS entirely — this just prevents any other client-side
-- role from directly inserting into merchants.)
CREATE POLICY "merchants_insert_platform_owner" ON public.merchants
  FOR INSERT WITH CHECK (is_platform_owner());

CREATE POLICY "merchants_update_own_org_or_platform" ON public.merchants
  FOR UPDATE USING (
    (organization_id = get_user_org_id() AND is_admin_or_above())
    OR is_platform_owner()
  );

CREATE POLICY "merchants_delete_platform_owner" ON public.merchants
  FOR DELETE USING (is_platform_owner());

DROP POLICY IF EXISTS "webhook_logs_select_admin" ON public.webhook_logs;
CREATE POLICY "webhook_logs_select_platform_owner" ON public.webhook_logs
  FOR SELECT USING (is_platform_owner());
-- Webhook logs are TradeTrack's own payment-gateway plumbing — no
-- merchant-side role (business_owner/admin) should read these.

DROP POLICY IF EXISTS "invoices_select_own_org" ON public.invoices;
CREATE POLICY "invoices_select_own_org_or_platform" ON public.invoices
  FOR SELECT USING (
    organization_id = get_user_org_id()
    OR is_platform_owner()
  );

DROP POLICY IF EXISTS "invoices_update_admin" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_service" ON public.invoices;
CREATE POLICY "invoices_update_platform_owner" ON public.invoices
  FOR UPDATE USING (is_platform_owner());
-- Invoice status is billing/reconciliation data, updated by the Zainpay
-- webhook (service role, bypasses RLS) or platform_owner — not by a
-- merchant's own admin/business_owner account.

DROP POLICY IF EXISTS "device_limits_own_org" ON public.merchant_device_limits;
CREATE POLICY "device_limits_own_org_or_platform" ON public.merchant_device_limits
  FOR ALL USING (
    merchant_id IN (
      SELECT m.id FROM public.merchants m
      WHERE m.organization_id = get_user_org_id()
    )
    OR is_platform_owner()
  );

-- ── 7. Sanity re-affirmation comment ────────────────────────────
COMMENT ON FUNCTION is_platform_owner() IS
  'TRUE only for TradeTrack''s own cross-organization staff accounts (role=platform_owner). Never true for a merchant''s business_owner/admin/cashier accounts.';
COMMENT ON FUNCTION is_business_owner() IS
  'TRUE only for a merchant''s top-level business_owner account, scoped to their own organization_id. Use alongside get_user_org_id() comparisons in policies, not on its own, when the check needs to also confirm same-org.';
