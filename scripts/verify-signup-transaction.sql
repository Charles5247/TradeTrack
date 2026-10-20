-- Reproduce the database portion of self-serve signup, then roll back every row.
BEGIN;
DO $$
DECLARE org_id uuid; verified_merchant_id uuid; trial_days numeric; subscription_count integer;
BEGIN
 INSERT INTO public.organizations(name,slug,email,subscription_plan_id,subscription_status,settings)
 VALUES('Signup verification (rolled back)','signup-verification-'||gen_random_uuid(),
 'signup-verification@example.invalid','b4000000-0000-0000-0000-000000000004','trial','{"_signup_trial":true}') RETURNING id INTO org_id;
 INSERT INTO public.merchants(organization_id,business_name,contact_name,contact_email,
 subscription_plan_id,status,verification_status,onboarding_completed,onboarding_step)
 VALUES(org_id,'Signup verification (rolled back)','Automated verification','signup-verification@example.invalid',
 'b4000000-0000-0000-0000-000000000004','active','unverified',true,5) RETURNING id INTO verified_merchant_id;
 SELECT extract(epoch FROM trial_ends_at-trial_started_at)/86400 INTO trial_days FROM public.organizations WHERE id=org_id;
 SELECT count(*) INTO subscription_count FROM public.subscriptions WHERE organization_id=org_id AND status='trial';
 IF trial_days IS DISTINCT FROM 30 OR subscription_count<>1 THEN RAISE EXCEPTION 'Trial verification failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.merchant_device_limits d WHERE d.merchant_id=verified_merchant_id) THEN RAISE EXCEPTION 'Merchant device limits missing'; END IF;
END $$;
ROLLBACK;
SELECT 'Signup organization, merchant, device limits and 30-day subscription verified; all test rows rolled back' AS result;
