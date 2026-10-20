-- Standalone repair for hosted databases with the legacy Business-plan UUID.
-- Safe to rerun. No existing paid plan, subscription, merchant or price changes.
BEGIN;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS trial_pending_verification boolean NOT NULL DEFAULT false;

INSERT INTO public.subscription_plans (
 id,name,price,currency,billing_cycle,max_cashiers,max_products,max_warehouses,
 features,is_active,trial_days
)
SELECT 'b4000000-0000-0000-0000-000000000004', 'Business', price,currency,billing_cycle,
 max_cashiers,700,max_warehouses,
 (SELECT jsonb_agg(DISTINCT feature) FROM jsonb_array_elements_text(
   COALESCE(features,'[]'::jsonb) || '["pos","inventory","basic_reports","receipt_printing","daily_summaries","advanced_reports","warehouses","vendors","low_stock_alerts","purchase_orders","audit_trail"]'::jsonb
 ) feature),
 false,30
FROM public.subscription_plans WHERE name='Business' AND is_active
ORDER BY created_at,id LIMIT 1
ON CONFLICT(id) DO NOTHING;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id='b4000000-0000-0000-0000-000000000004') THEN
   RAISE EXCEPTION 'No Business plan exists; configure the Business plan before enabling signup';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION track_private.create_signup_trial_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.intro_eligible AND NEW.subscription_status='trial' AND NEW.trial_started_at IS NOT NULL THEN
   IF auth.uid() IS NOT NULL AND NOT public.is_platform_owner() THEN
     RAISE EXCEPTION 'Self-serve trial creation requires server-side signup';
   END IF;
   INSERT INTO public.subscriptions(organization_id,plan_id,status,starts_at,expires_at,billing_cycle)
   SELECT NEW.id,NEW.subscription_plan_id,'trial',NEW.trial_started_at,NEW.trial_ends_at,'monthly'
   WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE organization_id=NEW.id);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.create_signup_trial_subscription() FROM PUBLIC;
DROP TRIGGER IF EXISTS create_signup_trial_subscription ON public.organizations;
CREATE TRIGGER create_signup_trial_subscription AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION track_private.create_signup_trial_subscription();
COMMIT;
