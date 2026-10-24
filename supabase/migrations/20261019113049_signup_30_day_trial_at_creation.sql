BEGIN;

-- Keep the canonical Business plan available for self-serve trial creation,
-- even in environments where the catalog row was not seeded.
INSERT INTO public.subscription_plans (
  id, name, price, currency, billing_cycle,
  max_cashiers, max_products, max_warehouses, features,
  is_active, is_popular, trial_days
)
VALUES (
  'b4000000-0000-0000-0000-000000000004',
  'Business',
  30000,
  'NGN',
  'monthly',
  12,
  5000,
  8,
  '["pos","inventory","basic_reports","receipt_printing","daily_summaries","advanced_reports","warehouses","vendors","barcode_label_printing","low_stock_alerts","purchase_orders","custom_role_permissions","priority_support"]'::jsonb,
  true,
  false,
  30
)
ON CONFLICT (id) DO UPDATE
SET is_active = true,
    trial_days = 30;

-- Self-serve signup explicitly inserts organizations with status `trial`.
-- Start their 30-day clock immediately; staff-onboarded organizations remain
-- suspended until the existing platform-owner verification flow completes.
CREATE OR REPLACE FUNCTION track_private.prepare_signup_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  trial_start TIMESTAMPTZ := statement_timestamp();
BEGIN
  IF NEW.intro_eligible IS TRUE THEN
    IF NEW.subscription_status = 'trial'
       AND NEW.settings->>'_signup_trial' = 'true' THEN
      IF current_user IN ('authenticated', 'anon')
         AND NOT public.is_platform_owner() THEN
        RAISE EXCEPTION 'Self-serve trial creation requires server-side signup';
      END IF;

      NEW.settings := NEW.settings - '_signup_trial';
      NEW.subscription_plan_id := 'b4000000-0000-0000-0000-000000000004';
      NEW.trial_pending_verification := FALSE;
      NEW.trial_started_at := trial_start;
      NEW.trial_ends_at := trial_start + INTERVAL '30 days';
      NEW.subscription_expires_at := NEW.trial_ends_at;
      NEW.subscription_period_start := NEW.trial_ends_at;
    ELSE
      NEW.trial_pending_verification := TRUE;
      NEW.subscription_status := 'suspended';
      NEW.trial_started_at := NULL;
      NEW.trial_ends_at := NULL;
      NEW.subscription_period_start := NULL;
      NEW.subscription_expires_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION track_private.prepare_signup_trial() FROM PUBLIC;

CREATE OR REPLACE FUNCTION track_private.create_signup_trial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.intro_eligible IS TRUE
     AND NEW.subscription_status = 'trial'
     AND NEW.trial_started_at IS NOT NULL THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_owner() THEN
      RAISE EXCEPTION 'Self-serve trial creation requires server-side signup';
    END IF;

    INSERT INTO public.subscriptions (
      organization_id, plan_id, status, starts_at, expires_at, billing_cycle
    ) VALUES (
      NEW.id,
      'b4000000-0000-0000-0000-000000000004',
      'trial',
      NEW.trial_started_at,
      NEW.trial_ends_at,
      'monthly'
    );
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION track_private.create_signup_trial_subscription() FROM PUBLIC;
CREATE TRIGGER create_signup_trial_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION track_private.create_signup_trial_subscription();

COMMIT;
