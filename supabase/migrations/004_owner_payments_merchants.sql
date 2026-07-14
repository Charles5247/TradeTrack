-- ============================================================
-- Migration 004: Merchants, Webhook Logs, Invoices
-- TRADETRACK — Owner Payment & Merchant Management Tables
-- ============================================================

-- ─────────────────────────────────────────
-- 1. MERCHANTS TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  business_name         TEXT NOT NULL,
  business_type         TEXT,
  registration_number   TEXT,
  tax_id                TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','active','suspended','deactivated')),
  verification_status   TEXT NOT NULL DEFAULT 'unverified'
                          CHECK (verification_status IN ('unverified','pending','verified','rejected')),
  contact_name          TEXT NOT NULL,
  contact_email         TEXT NOT NULL,
  contact_phone         TEXT,
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  country               TEXT NOT NULL DEFAULT 'Nigeria',
  logo_url              TEXT,
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step       INTEGER NOT NULL DEFAULT 1,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for merchants
CREATE INDEX IF NOT EXISTS idx_merchants_organization_id   ON public.merchants(organization_id);
CREATE INDEX IF NOT EXISTS idx_merchants_status            ON public.merchants(status);
CREATE INDEX IF NOT EXISTS idx_merchants_verification      ON public.merchants(verification_status);
CREATE INDEX IF NOT EXISTS idx_merchants_contact_email     ON public.merchants(contact_email);
CREATE INDEX IF NOT EXISTS idx_merchants_created_at        ON public.merchants(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_merchants_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchants_updated_at ON public.merchants;
CREATE TRIGGER trg_merchants_updated_at
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.update_merchants_updated_at();

-- ─────────────────────────────────────────
-- 2. WEBHOOK_LOGS TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL,                         -- e.g. 'zainpay'
  event_type        TEXT NOT NULL,                         -- e.g. 'deposit.successful'
  payload           JSONB NOT NULL DEFAULT '{}',
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error  TEXT,
  idempotency_key   TEXT UNIQUE,                           -- prevent duplicate processing
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for webhook_logs
CREATE INDEX IF NOT EXISTS idx_webhook_logs_provider        ON public.webhook_logs(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_type      ON public.webhook_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_processed       ON public.webhook_logs(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_idempotency     ON public.webhook_logs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at      ON public.webhook_logs(created_at DESC);

-- Partition-friendly: retain only last 90 days of webhook logs automatically
-- (Supabase pg_cron can be used for cleanup — SQL only here)

-- ─────────────────────────────────────────
-- 3. INVOICES TABLE
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id           UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  payment_transaction_id    UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  invoice_number            TEXT NOT NULL UNIQUE,
  amount                    NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency                  TEXT NOT NULL DEFAULT 'NGN',
  status                    TEXT NOT NULL DEFAULT 'unpaid'
                              CHECK (status IN ('paid','unpaid','cancelled')),
  due_date                  TIMESTAMPTZ,
  paid_at                   TIMESTAMPTZ,
  pdf_url                   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_organization_id         ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id         ON public.invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_transaction_id  ON public.invoices(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status                  ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at              ON public.invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number          ON public.invoices(invoice_number);

-- Invoice number sequence for human-readable IDs
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1000 INCREMENT BY 1;

-- Function to auto-generate invoice_number if not provided
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('public.invoice_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_number ON public.invoices;
CREATE TRIGGER trg_invoices_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.generate_invoice_number();

-- ─────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — MERCHANTS
-- ─────────────────────────────────────────
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

-- Users can only view/edit merchants belonging to their organization
CREATE POLICY "merchants_select_own_org" ON public.merchants
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner','super_admin')
    )
  );

CREATE POLICY "merchants_insert_owner" ON public.merchants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner','super_admin','admin')
    )
  );

CREATE POLICY "merchants_update_owner" ON public.merchants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner','super_admin','admin')
    )
  );

CREATE POLICY "merchants_delete_owner" ON public.merchants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner','super_admin')
    )
  );

-- ─────────────────────────────────────────
-- 5. ROW LEVEL SECURITY — WEBHOOK_LOGS
-- ─────────────────────────────────────────
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- Webhook logs: only accessible via service role (no anon/user read access)
-- Admin/owner users can read for debugging
CREATE POLICY "webhook_logs_select_admin" ON public.webhook_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner','super_admin','admin')
    )
  );

-- Inserts only via service role (API routes use service key)
CREATE POLICY "webhook_logs_insert_service" ON public.webhook_logs
  FOR INSERT WITH CHECK (TRUE); -- controlled by service role key at API level

CREATE POLICY "webhook_logs_update_service" ON public.webhook_logs
  FOR UPDATE USING (TRUE); -- service role only

-- ─────────────────────────────────────────
-- 6. ROW LEVEL SECURITY — INVOICES
-- ─────────────────────────────────────────
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_own_org" ON public.invoices
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner','super_admin')
    )
  );

CREATE POLICY "invoices_insert_service" ON public.invoices
  FOR INSERT WITH CHECK (TRUE); -- service role only from API routes

CREATE POLICY "invoices_update_service" ON public.invoices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner','super_admin','admin')
    )
  );

-- ─────────────────────────────────────────
-- 7. MERCHANT DEVICE LIMITS TABLE
-- ─────────────────────────────────────────
-- Tracks per-merchant device/terminal limits based on subscription plan
CREATE TABLE IF NOT EXISTS public.merchant_device_limits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  plan_type       TEXT NOT NULL DEFAULT 'starter' CHECK (plan_type IN ('starter','professional','enterprise')),
  max_devices     INTEGER NOT NULL DEFAULT 1,
  current_devices INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_merchant_device_limits_merchant ON public.merchant_device_limits(merchant_id);

ALTER TABLE public.merchant_device_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "device_limits_own_org" ON public.merchant_device_limits
  FOR ALL USING (
    merchant_id IN (
      SELECT m.id FROM public.merchants m
      JOIN public.users u ON u.organization_id = m.organization_id
      WHERE u.id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner','super_admin')
    )
  );

-- Auto-create device limits row when merchant is created
CREATE OR REPLACE FUNCTION public.create_merchant_device_limits()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.merchant_device_limits (merchant_id, plan_type, max_devices)
  VALUES (NEW.id, 'starter', 1)
  ON CONFLICT (merchant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_device_limits ON public.merchants;
CREATE TRIGGER trg_merchant_device_limits
  AFTER INSERT ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.create_merchant_device_limits();

-- ─────────────────────────────────────────
-- 8. GRANT SERVICE ROLE ACCESS
-- ─────────────────────────────────────────
-- These grants allow the service role key (used in API routes) to bypass RLS
-- and perform full CRUD on the new tables.
GRANT ALL ON public.merchants                TO service_role;
GRANT ALL ON public.webhook_logs             TO service_role;
GRANT ALL ON public.invoices                 TO service_role;
GRANT ALL ON public.merchant_device_limits   TO service_role;
GRANT USAGE ON SEQUENCE public.invoice_number_seq TO service_role;

-- Anon and authenticated get limited access (RLS handles the rest)
GRANT SELECT ON public.merchants              TO authenticated;
GRANT SELECT ON public.invoices              TO authenticated;
GRANT SELECT ON public.webhook_logs          TO authenticated;
GRANT SELECT ON public.merchant_device_limits TO authenticated;

-- ─────────────────────────────────────────
-- 9. SEED: DEFAULT MERCHANT ONBOARDING STEPS ENUM COMMENT
-- ─────────────────────────────────────────
-- Onboarding steps reference:
--   1 = Business Information
--   2 = Contact & Address
--   3 = Document Verification
--   4 = Payment Setup
--   5 = Complete
COMMENT ON COLUMN public.merchants.onboarding_step IS
  'Step 1=Business Info, 2=Contact/Address, 3=Documents, 4=Payment Setup, 5=Complete';

-- ─────────────────────────────────────────
-- 10. ANALYTICS VIEWS (optional helpers)
-- ─────────────────────────────────────────

-- MRR / ARR summary by status
CREATE OR REPLACE VIEW public.v_subscription_revenue AS
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(*) FILTER (WHERE status = 'active') AS active_subscriptions,
  SUM(amount) FILTER (WHERE status = 'paid') AS mrr
FROM public.invoices
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month DESC;

GRANT SELECT ON public.v_subscription_revenue TO authenticated;
GRANT SELECT ON public.v_subscription_revenue TO service_role;

-- Merchant summary view
CREATE OR REPLACE VIEW public.v_merchant_summary AS
SELECT
  m.id,
  m.business_name,
  m.status,
  m.verification_status,
  m.onboarding_completed,
  m.contact_email,
  m.country,
  m.created_at,
  dl.plan_type,
  dl.max_devices,
  dl.current_devices,
  COUNT(i.id) AS total_invoices,
  COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) AS total_paid
FROM public.merchants m
LEFT JOIN public.merchant_device_limits dl ON dl.merchant_id = m.id
LEFT JOIN public.invoices i ON i.organization_id = m.organization_id
GROUP BY m.id, m.business_name, m.status, m.verification_status,
         m.onboarding_completed, m.contact_email, m.country, m.created_at,
         dl.plan_type, dl.max_devices, dl.current_devices;

GRANT SELECT ON public.v_merchant_summary TO authenticated;
GRANT SELECT ON public.v_merchant_summary TO service_role;
