-- ============================================================
-- Migration 007: Feature Updates
-- ============================================================
-- 1. Remove the 'manager' role entirely (widen -> narrow CHECK
--    constraint back down to super_admin/admin/owner/cashier).
--    Any existing 'manager' rows are reassigned to 'cashier'
--    before the constraint is tightened.
-- 2. Add initiated_by / approved_by / coordinated_by to
--    warehouse_transfers (who requested, approved and
--    coordinates the transfer).
-- 3. Add payment_method + receipt_url to vendor_transactions
--    (Cash / Transfer / POS dropdown + optional proof-of-payment
--    upload).
-- 4. Add must_change_password to users (forces a password change
--    on first login for merchant-contact accounts).
-- 5. Add subscription_plan_id to merchants (Owner selects a plan
--    at merchant-creation time).
-- 6. Allow the 'owner' role full CRUD on subscription_plans
--    (view/add/edit price/remove packages), not just super_admin.
-- ============================================================

-- ── 1. Remove 'manager' role ───────────────────────────────────
UPDATE users SET role = 'cashier' WHERE role = 'manager';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'owner', 'cashier'));

-- ── 4. must_change_password on users ───────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Warehouse transfer accountability fields ────────────────
ALTER TABLE warehouse_transfers ADD COLUMN IF NOT EXISTS initiated_by TEXT;
ALTER TABLE warehouse_transfers ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE warehouse_transfers ADD COLUMN IF NOT EXISTS coordinated_by TEXT;

-- ── 3. Vendor transaction payment method + receipt upload ──────
ALTER TABLE vendor_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)
  CHECK (payment_method IN ('cash', 'transfer', 'pos'));
ALTER TABLE vendor_transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- ── 5. Merchant subscription plan selection ─────────────────────
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS subscription_plan_id UUID REFERENCES subscription_plans(id);

-- ── 6. Owner CRUD on subscription_plans ─────────────────────────
-- Replace the super_admin-only manage policy with one that also
-- grants the 'owner' role full CRUD (view / set price / add /
-- remove subscription packages).
DROP POLICY IF EXISTS "plans_manage_super_admin" ON subscription_plans;
CREATE POLICY "plans_manage_owner_or_super_admin" ON subscription_plans
  FOR ALL USING (is_super_admin() OR get_user_role() = 'owner')
  WITH CHECK (is_super_admin() OR get_user_role() = 'owner');

-- Owner should also be able to see inactive plans (needed to manage them)
DROP POLICY IF EXISTS "plans_select_all" ON subscription_plans;
CREATE POLICY "plans_select_all" ON subscription_plans
  FOR SELECT USING (is_active = true OR is_super_admin() OR get_user_role() = 'owner');

-- ── Payment receipts storage bucket note ────────────────────────
-- The 'receipts' private bucket (documented in
-- 003_payment_and_improvements.sql) is reused for optional
-- payment-proof uploads on both POS sales (sales.receipt_url,
-- already existed) and vendor payments (vendor_transactions.receipt_url,
-- added above). Create the bucket via the Supabase dashboard/CLI if
-- it does not already exist:
--   supabase storage buckets create receipts --private
