-- TracKasuwa: new-organization introductory period, server-time verification.
BEGIN;
CREATE SCHEMA IF NOT EXISTS track_private;
REVOKE ALL ON SCHEMA track_private FROM PUBLIC;
ALTER TABLE public.organizations ADD COLUMN intro_eligible boolean NOT NULL DEFAULT false;
ALTER TABLE public.organizations ALTER COLUMN intro_eligible SET DEFAULT true;
ALTER TABLE public.organizations ADD COLUMN trial_started_at timestamptz;
ALTER TABLE public.organizations ADD COLUMN trial_ends_at timestamptz;
ALTER TABLE public.organizations ADD COLUMN subscription_period_start timestamptz;

CREATE FUNCTION track_private.activate_intro() RETURNS trigger
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
    NEW.expires_at := NEW.starts_at + CASE WHEN NEW.billing_cycle = 'yearly' THEN interval '1 year' ELSE interval '1 month' END;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.activate_intro() FROM PUBLIC;
CREATE TRIGGER subscription_intro BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION track_private.activate_intro();

CREATE FUNCTION track_private.protect_intro() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.intro_eligible IS DISTINCT FROM OLD.intro_eligible OR
    NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at OR
    NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at OR
    NEW.subscription_period_start IS DISTINCT FROM OLD.subscription_period_start
  ) THEN RAISE EXCEPTION 'Introductory dates are server managed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_intro BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION track_private.protect_intro();

CREATE FUNCTION public.verify_business_subscription() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org public.organizations; sub public.subscriptions; active boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT o.* INTO org FROM public.organizations o JOIN public.users u ON u.organization_id=o.id
    WHERE u.id=auth.uid() AND u.status='active';
  IF org.id IS NULL THEN RAISE EXCEPTION 'Business membership required'; END IF;
  SELECT * INTO sub FROM public.subscriptions WHERE organization_id=org.id ORDER BY created_at DESC, id DESC LIMIT 1;
  active := COALESCE(sub.status IN ('active','trial') AND
    (sub.expires_at > statement_timestamp() OR org.trial_ends_at > statement_timestamp()), false);
  RETURN jsonb_build_object('organization_id', org.id, 'active', active,
    'server_time', statement_timestamp(), 'trial_ends_at', org.trial_ends_at,
    'subscription_period_start', org.subscription_period_start, 'plan_id', sub.plan_id);
END $$;
REVOKE ALL ON FUNCTION public.verify_business_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_business_subscription() TO authenticated;
COMMIT;
