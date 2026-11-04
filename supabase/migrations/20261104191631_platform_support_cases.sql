CREATE TABLE public.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  reporter_id uuid NOT NULL REFERENCES public.users(id),
  source text NOT NULL CHECK (source IN ('merchant', 'sync')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 160),
  detail text NOT NULL CHECK (char_length(detail) BETWEEN 5 AND 5000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  owner_note text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

CREATE INDEX support_cases_queue ON public.support_cases(status, created_at DESC);
CREATE INDEX support_cases_merchant ON public.support_cases(organization_id, created_at DESC);
CREATE UNIQUE INDEX support_cases_open_dedupe ON public.support_cases(organization_id, reporter_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status <> 'resolved';

ALTER TABLE public.support_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_cases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_cases TO authenticated;
GRANT ALL ON public.support_cases TO service_role;

CREATE POLICY support_cases_read ON public.support_cases FOR SELECT TO authenticated
  USING (public.get_user_role() = 'platform_owner' OR
    (organization_id = public.get_user_org_id() AND
      (public.get_user_role() IN ('business_owner', 'admin') OR reporter_id = (SELECT auth.uid()))));
CREATE POLICY support_cases_report ON public.support_cases FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id() AND reporter_id = (SELECT auth.uid())
    AND source = 'merchant' AND status = 'open' AND owner_note IS NULL AND responded_at IS NULL AND dedupe_key IS NULL);
CREATE POLICY support_cases_manage ON public.support_cases FOR UPDATE TO authenticated
  USING (public.get_user_role() = 'platform_owner')
  WITH CHECK (public.get_user_role() = 'platform_owner');

CREATE OR REPLACE FUNCTION public.support_case_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER support_case_touch BEFORE UPDATE ON public.support_cases
  FOR EACH ROW EXECUTE FUNCTION public.support_case_touch();

-- Platform owners have no merchant organization. Their personal alert bell
-- still needs to mark their own notifications as read.
CREATE POLICY notifications_platform_owner_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.get_user_role() = 'platform_owner')
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.get_user_role() = 'platform_owner');
