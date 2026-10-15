BEGIN;

-- Carry forward registration numbers already stored in business settings so
-- duplicate businesses cannot claim another trial through the new workflow.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.merchants m
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE NULLIF(BTRIM(m.registration_number), '') IS NOT NULL
      AND NULLIF(BTRIM(o.settings->>'registration_number'), '') IS NOT NULL
      AND UPPER(REGEXP_REPLACE(BTRIM(m.registration_number), '[[:space:]]+', '', 'g'))
          <> UPPER(REGEXP_REPLACE(BTRIM(o.settings->>'registration_number'), '[[:space:]]+', '', 'g'))
  ) THEN
    RAISE EXCEPTION 'Conflicting business registration numbers exist between merchant records and business settings. Resolve them before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE NULLIF(BTRIM(o.settings->>'registration_number'), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.merchants m WHERE m.organization_id = o.id
      )
  ) THEN
    RAISE EXCEPTION 'An organization has a registration number but no merchant record. Resolve it before applying this migration.';
  END IF;
END $$;

UPDATE public.merchants m
SET registration_number = NULLIF(BTRIM(o.settings->>'registration_number'), '')
FROM public.organizations o
WHERE o.id = m.organization_id
  AND NULLIF(BTRIM(m.registration_number), '') IS NULL
  AND NULLIF(BTRIM(o.settings->>'registration_number'), '') IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.merchants
    WHERE NULLIF(BTRIM(registration_number), '') IS NOT NULL
    GROUP BY UPPER(REGEXP_REPLACE(BTRIM(registration_number), '[[:space:]]+', '', 'g'))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate business registration numbers already exist. Resolve them before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX merchants_registration_number_normalized_uidx
  ON public.merchants (
    UPPER(REGEXP_REPLACE(BTRIM(registration_number), '[[:space:]]+', '', 'g'))
  )
  WHERE NULLIF(BTRIM(registration_number), '') IS NOT NULL;

-- Only organizations created after this migration are eligible to start the
-- trial. Existing rows keep their current entitlement and trial fields.
ALTER TABLE public.organizations
  ADD COLUMN trial_pending_verification BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION track_private.prepare_signup_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.intro_eligible IS TRUE THEN
    NEW.trial_pending_verification := TRUE;
    NEW.subscription_status := 'suspended';
    NEW.trial_started_at := NULL;
    NEW.trial_ends_at := NULL;
    NEW.subscription_period_start := NULL;
    NEW.subscription_expires_at := NULL;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION track_private.prepare_signup_trial() FROM PUBLIC;
CREATE TRIGGER prepare_signup_trial
  BEFORE INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION track_private.prepare_signup_trial();

CREATE OR REPLACE FUNCTION track_private.protect_intro()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.intro_eligible IS DISTINCT FROM OLD.intro_eligible OR
    NEW.trial_pending_verification IS DISTINCT FROM OLD.trial_pending_verification OR
    NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at OR
    NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at OR
    NEW.subscription_period_start IS DISTINCT FROM OLD.subscription_period_start
  ) THEN
    RAISE EXCEPTION 'Introductory dates are server managed';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION track_private.guard_merchant_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.registration_number IS DISTINCT FROM OLD.registration_number THEN
    NEW.verification_status := 'pending';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_platform_owner()
     AND NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NEW.verification_status <> 'pending' THEN
    RAISE EXCEPTION 'Only a platform owner can approve or reject business verification';
  END IF;

  IF NEW.verification_status = 'verified'
     AND NULLIF(BTRIM(NEW.registration_number), '') IS NULL THEN
    RAISE EXCEPTION 'A business registration number is required before verification';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER guard_merchant_verification
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION track_private.guard_merchant_verification();

-- The trial clock starts once, at the moment a platform owner approves a
-- newly-created business with a unique registration number.
CREATE OR REPLACE FUNCTION track_private.start_verified_signup_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org public.organizations;
  trial_start TIMESTAMPTZ := statement_timestamp();
  trial_end TIMESTAMPTZ;
BEGIN
  IF OLD.verification_status IS NOT DISTINCT FROM 'verified'
     OR NEW.verification_status IS DISTINCT FROM 'verified' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Only a platform owner can start a verified business trial';
  END IF;

  SELECT * INTO org
  FROM public.organizations
  WHERE id = NEW.organization_id
  FOR UPDATE;

  IF NOT FOUND OR org.trial_pending_verification IS NOT TRUE
     OR org.trial_started_at IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.subscriptions s
       WHERE s.organization_id = NEW.organization_id
     ) THEN
    RETURN NEW;
  END IF;

  IF NULLIF(BTRIM(NEW.registration_number), '') IS NULL THEN
    RAISE EXCEPTION 'A business registration number is required before verification';
  END IF;

  trial_end := trial_start + INTERVAL '30 days';

  UPDATE public.organizations
  SET subscription_plan_id = 'b4000000-0000-0000-0000-000000000004',
      subscription_status = 'trial',
      subscription_expires_at = trial_end,
      trial_pending_verification = FALSE,
      trial_started_at = trial_start,
      trial_ends_at = trial_end,
      subscription_period_start = trial_end
  WHERE id = NEW.organization_id;

  INSERT INTO public.subscriptions (
    organization_id, plan_id, status, starts_at, expires_at, created_by, billing_cycle
  ) VALUES (
    NEW.organization_id,
    'b4000000-0000-0000-0000-000000000004',
    'trial',
    trial_start,
    trial_end,
    NEW.business_owner_user_id,
    'monthly'
  );

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION track_private.start_verified_signup_trial() FROM PUBLIC;
CREATE TRIGGER start_verified_signup_trial
  AFTER UPDATE OF verification_status ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION track_private.start_verified_signup_trial();

-- A trial subscription cannot be used to extend the server-managed dates.
-- Paid activation remains restricted to server-confirmed payments.
CREATE OR REPLACE FUNCTION track_private.activate_intro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org public.organizations;
BEGIN
  SELECT * INTO org
  FROM public.organizations
  WHERE id = NEW.organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  IF NEW.status = 'trial' THEN
    IF org.intro_eligible IS NOT TRUE
       OR org.trial_started_at IS NULL
       OR org.trial_ends_at IS NULL
       OR NEW.plan_id IS DISTINCT FROM org.subscription_plan_id THEN
      RAISE EXCEPTION 'A trial must be started by verified business approval';
    END IF;
    NEW.starts_at := org.trial_started_at;
    NEW.expires_at := org.trial_ends_at;
  ELSIF NEW.status = 'active' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.payment_transactions p
      WHERE p.organization_id = org.id AND p.status = 'success'
    ) THEN
      RAISE EXCEPTION 'Payment confirmation is required before activation';
    END IF;

    IF org.trial_ends_at IS NOT NULL THEN
      NEW.starts_at := GREATEST(org.trial_ends_at, statement_timestamp());
    ELSIF NEW.starts_at < statement_timestamp() THEN
      NEW.starts_at := statement_timestamp();
    END IF;
    NEW.expires_at := NEW.starts_at + CASE
      WHEN NEW.billing_cycle = 'yearly' THEN INTERVAL '1 year'
      ELSE INTERVAL '1 month'
    END;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION track_private.assert_active_transaction_access(target_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org public.organizations;
  trial_active BOOLEAN;
  paid_active BOOLEAN;
BEGIN
  SELECT * INTO org
  FROM public.organizations
  WHERE id = target_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  IF org.subscription_status = 'suspended' THEN
    RAISE EXCEPTION 'Business verification or an active subscription is required before creating transactions';
  END IF;

  trial_active := COALESCE(
    org.trial_started_at <= statement_timestamp()
    AND org.trial_ends_at > statement_timestamp(),
    FALSE
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.organization_id = org.id
      AND s.status IN ('active', 'trial')
      AND s.starts_at <= statement_timestamp()
      AND s.expires_at > statement_timestamp()
  ) INTO paid_active;

  IF NOT trial_active AND NOT paid_active THEN
    RAISE EXCEPTION 'Trial ended: choose a plan before creating transactions';
  END IF;
END
$$;
REVOKE ALL ON FUNCTION track_private.assert_active_transaction_access(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION track_private.require_active_transaction_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM track_private.assert_active_transaction_access(NEW.organization_id);
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION track_private.require_active_transaction_access() FROM PUBLIC;

DROP TRIGGER IF EXISTS require_active_transaction_access ON public.sales;
CREATE TRIGGER require_active_transaction_access
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION track_private.require_active_transaction_access();

CREATE TRIGGER require_active_vendor_transaction_access
  BEFORE INSERT ON public.vendor_transactions
  FOR EACH ROW EXECUTE FUNCTION track_private.require_active_transaction_access();

CREATE TRIGGER require_active_purchase_order_access
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION track_private.require_active_transaction_access();

CREATE OR REPLACE FUNCTION public.verify_business_subscription()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org public.organizations;
  sub public.subscriptions;
  active BOOLEAN;
  trial_active BOOLEAN;
  valid_until TIMESTAMPTZ;
  business_verification_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT o.* INTO org
  FROM public.organizations o
  JOIN public.users u ON u.organization_id = o.id
  WHERE u.id = auth.uid() AND u.status = 'active';

  IF org.id IS NULL THEN
    RAISE EXCEPTION 'Business membership required';
  END IF;

  SELECT m.verification_status INTO business_verification_status
  FROM public.merchants m
  WHERE m.organization_id = org.id
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT 1;

  SELECT * INTO sub
  FROM public.subscriptions
  WHERE organization_id = org.id
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  trial_active := COALESCE(
    org.trial_started_at <= statement_timestamp()
    AND org.trial_ends_at > statement_timestamp(),
    FALSE
  );
  active := org.subscription_status <> 'suspended'
    AND (
      trial_active OR COALESCE(
        sub.status = 'active'
        AND sub.starts_at <= statement_timestamp()
        AND sub.expires_at > statement_timestamp(),
        FALSE
      )
    );
  valid_until := CASE WHEN trial_active THEN org.trial_ends_at ELSE sub.expires_at END;

  IF trial_active AND sub.status = 'active' AND sub.expires_at > valid_until THEN
    valid_until := sub.expires_at;
  END IF;

  RETURN jsonb_build_object(
    'organization_id', org.id,
    'active', active,
    'server_time', statement_timestamp(),
    'trial_ends_at', org.trial_ends_at,
    'subscription_period_start', org.subscription_period_start,
    'valid_until', valid_until,
    'plan_id', sub.plan_id,
    'business_verification_status', COALESCE(business_verification_status, 'unverified')
  );
END
$$;
REVOKE ALL ON FUNCTION public.verify_business_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_business_subscription() TO authenticated;

COMMIT;
