-- ============================================================
-- TradeTrack - Migration 003: Payment Transactions & Improvements
-- ============================================================

-- ── Payment Transactions ──────────────────────────────────────
-- Used by subscription billing, Zainpay webhooks, etc.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'NGN',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','success','failed','refunded')),
  payment_method VARCHAR(50) DEFAULT 'zainpay',
  reference VARCHAR(255) UNIQUE,
  zainpay_reference VARCHAR(255),
  plan_name VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_org ON payment_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(reference);

-- ── Add billing_cycle to subscription_plans if missing ───────
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 0;

-- ── Add stripe/zainpay fields to subscriptions ───────────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ── Storage Buckets (informational - create via dashboard) ────
-- Bucket: product-images (public: true)
-- Bucket: organization-assets (public: true)
-- Bucket: receipts (public: false)

-- ── RLS for payment_transactions ─────────────────────────────
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Users can see their own org's payment history
CREATE POLICY "payment_transactions_select_own_org"
  ON payment_transactions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Only service role can insert/update (via API routes)
CREATE POLICY "payment_transactions_service_insert"
  ON payment_transactions FOR INSERT
  WITH CHECK (false); -- Deny all direct inserts; use service role via API

CREATE POLICY "payment_transactions_service_update"
  ON payment_transactions FOR UPDATE
  USING (false); -- Deny all direct updates; use service role via API

-- ── Improve audit_logs RLS ────────────────────────────────────
-- Drop existing policies if any and recreate cleanly
DROP POLICY IF EXISTS "audit_logs_select_own_org" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_own" ON audit_logs;

-- SELECT: users can read their own org's audit trail
CREATE POLICY "audit_logs_select_own_org"
  ON audit_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- INSERT: deny direct inserts from browser (must use API route with service key)
-- This is intentional - audit logs must only be written server-side
CREATE POLICY "audit_logs_no_direct_insert"
  ON audit_logs FOR INSERT
  WITH CHECK (false);

-- ── Add missing columns to users ─────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── Trigger for payment_transactions ─────────────────────────
CREATE TRIGGER update_payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- SEED: Default subscription plans
-- (Run only once - use IF NOT EXISTS pattern)
-- ============================================================
INSERT INTO subscription_plans (id, name, price, currency, billing_cycle, max_cashiers, max_products, max_warehouses, features, is_active, is_popular)
VALUES
  (
    'a1111111-0000-0000-0000-000000000001'::UUID,
    'Basic',
    3000,
    'NGN',
    'monthly',
    1,
    500,
    1,
    '["Inventory Management","Basic Sales","Sales Reports","Offline Mode","1 Cashier","Email Support"]'::JSONB,
    true,
    false
  ),
  (
    'a2222222-0000-0000-0000-000000000002'::UUID,
    'Standard',
    5000,
    'NGN',
    'monthly',
    3,
    2000,
    2,
    '["Everything in Basic","Receipt Printing","Daily Summaries","Vendor Consignment","Warehouse Transfers","3 Cashiers","Priority Support"]'::JSONB,
    true,
    true
  ),
  (
    'a3333333-0000-0000-0000-000000000003'::UUID,
    'Business',
    8000,
    'NGN',
    'monthly',
    -1,
    NULL,
    NULL,
    '["Everything in Standard","Unlimited Products","Unlimited Warehouses","Unlimited Cashiers","Advanced Reports","Audit Trail","API Access","Dedicated Support"]'::JSONB,
    true,
    false
  )
ON CONFLICT (id) DO NOTHING;
