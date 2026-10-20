BEGIN;
-- Hosted environments previously provisioned outside migration history may
-- have verification but lack the shared write guard. Preserve paid and trial
-- dates; use database time rather than user-controlled timestamps.
CREATE OR REPLACE FUNCTION track_private.assert_active_transaction_access(target_organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org public.organizations;
BEGIN
 SELECT * INTO org FROM public.organizations WHERE id=target_organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Business not found'; END IF;
 IF org.subscription_status='suspended' THEN
   RAISE EXCEPTION 'Business verification or an active subscription is required before creating transactions';
 END IF;
 IF NOT COALESCE(org.trial_started_at<=statement_timestamp() AND org.trial_ends_at>statement_timestamp(),false)
   AND NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE organization_id=org.id
     AND status IN ('active','trial') AND starts_at<=statement_timestamp() AND expires_at>statement_timestamp()) THEN
   RAISE EXCEPTION 'Trial ended: choose a plan before creating transactions';
 END IF;
END $$;
REVOKE ALL ON FUNCTION track_private.assert_active_transaction_access(uuid) FROM PUBLIC;
COMMIT;
