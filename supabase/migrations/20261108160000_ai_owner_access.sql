-- Keep direct RPC access aligned with the owner-only assistant API and UI.
-- Rollback: restore the prior assert_ai_access body from 016_ai_assistant_plumbing.sql.
CREATE OR REPLACE FUNCTION track_private.assert_ai_access() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v jsonb; org uuid;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.users
   WHERE id = auth.uid() AND role = 'business_owner' AND status = 'active'
 ) THEN RAISE EXCEPTION 'Business owner required'; END IF;
 v := public.verify_business_subscription();
 org := (v->>'organization_id')::uuid;
 IF NOT COALESCE((v->>'active')::boolean, false) OR NOT (
   COALESCE((v->>'trial_ends_at')::timestamptz > statement_timestamp(), false) OR
   COALESCE(v->>'plan_id' IN (
     'b3000000-0000-0000-0000-000000000003',
     'b4000000-0000-0000-0000-000000000004',
     'b5000000-0000-0000-0000-000000000005'
   ), false)
 ) THEN RAISE EXCEPTION 'AI requires the introductory period or Growth and above'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION track_private.assert_ai_access() FROM PUBLIC;
