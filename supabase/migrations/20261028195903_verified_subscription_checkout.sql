BEGIN;
-- Additive compatibility for hosted and migration-built payment tables.
ALTER TABLE public.payment_transactions
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS plan_id uuid,
  ADD COLUMN IF NOT EXISTS initiated_by uuid;

CREATE TABLE IF NOT EXISTS public.subscription_checkouts (
  reference text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  plan_name text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly','quarterly','biannual','yearly')),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  mode text NOT NULL CHECK (mode IN ('test','live')),
  zainbox_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  subscription_id uuid REFERENCES public.subscriptions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS subscription_checkouts_organization_idx ON public.subscription_checkouts(organization_id);
ALTER TABLE public.subscription_checkouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_checkouts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscription_checkouts TO service_role;

-- The server must verify the provider first. Neither browser roles nor webhooks
-- can call this function directly. All accounting writes commit or roll back together.
CREATE OR REPLACE FUNCTION public.finalize_subscription_checkout(p_reference text, p_amount_kobo bigint, p_provider_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  c public.subscription_checkouts;
  current_sub public.subscriptions;
  subscription_uuid uuid;
  payment_uuid uuid;
  period_start timestamptz := statement_timestamp();
  period_end timestamptz;
  trial_end timestamptz;
  months integer;
BEGIN
  SELECT * INTO c FROM public.subscription_checkouts WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout not found'; END IF;
  IF c.amount_kobo <> p_amount_kobo THEN RAISE EXCEPTION 'Payment amount mismatch'; END IF;
  IF c.mode <> 'live' THEN RAISE EXCEPTION 'Sandbox payments cannot activate a paid subscription'; END IF;
  IF c.status='paid' THEN RETURN jsonb_build_object('subscription_id',c.subscription_id,'already_processed',true); END IF;
  SELECT trial_ends_at INTO trial_end FROM public.organizations WHERE id=c.organization_id FOR UPDATE;
  SELECT * INTO current_sub FROM public.subscriptions
    WHERE organization_id=c.organization_id AND status='active' AND expires_at>period_start
    ORDER BY expires_at DESC LIMIT 1 FOR UPDATE;
  -- Preserve remaining paid time on renewals. Plan changes start immediately;
  -- the checkout UI explains this before the user chooses a different plan.
  IF current_sub.id IS NOT NULL AND current_sub.plan_id=c.plan_id THEN
    period_end := current_sub.expires_at;
  ELSE
    period_end := GREATEST(period_start, trial_end);
  END IF;
  months := CASE c.billing_cycle WHEN 'quarterly' THEN 3 WHEN 'biannual' THEN 6 WHEN 'yearly' THEN 12 ELSE 1 END;
  period_end := period_end + make_interval(months => months);

  INSERT INTO public.payment_transactions(organization_id,amount,currency,status,payment_method,reference,provider_reference,provider,plan_id,initiated_by,metadata,provider_response)
  VALUES(c.organization_id,c.amount_kobo/100.0,'NGN','success','zainpay',c.reference,c.reference,'zainpay',c.plan_id,c.user_id,
    jsonb_build_object('billing_cycle',c.billing_cycle,'plan_name',c.plan_name),p_provider_response)
  RETURNING id INTO payment_uuid;
  UPDATE public.subscriptions SET status='expired'
    WHERE organization_id=c.organization_id AND status IN ('active','trial');
  INSERT INTO public.subscriptions(organization_id,plan_id,status,starts_at,expires_at,created_by,billing_cycle)
  VALUES(c.organization_id,c.plan_id,'active',period_start,period_end,c.user_id,c.billing_cycle)
  RETURNING id INTO subscription_uuid;
  UPDATE public.payment_transactions SET subscription_id=subscription_uuid WHERE id=payment_uuid;
  INSERT INTO public.invoices(organization_id,subscription_id,payment_transaction_id,invoice_number,amount,currency,status,paid_at)
  VALUES(c.organization_id,subscription_uuid,payment_uuid,'INV-'||c.reference,c.amount_kobo/100.0,'NGN','paid',period_start);
  UPDATE public.organizations SET subscription_status='active',subscription_plan_id=c.plan_id WHERE id=c.organization_id;
  UPDATE public.subscription_checkouts SET status='paid',subscription_id=subscription_uuid,paid_at=period_start WHERE reference=c.reference;
  RETURN jsonb_build_object('subscription_id',subscription_uuid,'expires_at',period_end,'already_processed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_subscription_checkout(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_subscription_checkout(text,bigint,jsonb) TO service_role;
COMMIT;
