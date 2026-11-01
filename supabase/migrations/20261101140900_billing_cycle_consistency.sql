BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';

ALTER TABLE public.subscription_checkouts
  ADD COLUMN IF NOT EXISTS billing_cycle text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_billing_cycle_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_billing_cycle_check
      CHECK (billing_cycle IN ('monthly', 'quarterly', 'biannual', 'yearly'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION track_private.activate_intro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org public.organizations; start_time timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Subscription activation requires server-confirmed payment';
  END IF;
  SELECT * INTO org FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;
  IF NEW.status = 'active' AND org.intro_eligible AND org.trial_started_at IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.payment_transactions WHERE organization_id = NEW.organization_id AND status = 'success') THEN
      RAISE EXCEPTION 'Payment confirmation is required before activation';
    END IF;
    start_time := statement_timestamp();
    UPDATE public.organizations SET trial_started_at = start_time,
      trial_ends_at = start_time + interval '30 days',
      subscription_period_start = start_time + interval '30 days'
      WHERE id = org.id;
    NEW.starts_at := start_time + interval '30 days';
    NEW.expires_at := NEW.starts_at + CASE NEW.billing_cycle
      WHEN 'quarterly' THEN make_interval(months => 3)
      WHEN 'biannual' THEN make_interval(months => 6)
      WHEN 'yearly' THEN make_interval(months => 12)
      ELSE make_interval(months => 1)
    END;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
