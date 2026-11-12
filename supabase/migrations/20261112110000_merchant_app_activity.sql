BEGIN;

CREATE TABLE public.merchant_app_activity (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_opened_at timestamptz NOT NULL
);
ALTER TABLE public.merchant_app_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY merchant_app_activity_platform_read ON public.merchant_app_activity
  FOR SELECT TO authenticated USING (public.is_platform_owner());
GRANT SELECT ON public.merchant_app_activity TO authenticated;

CREATE FUNCTION public.record_merchant_app_open()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE merchant_org uuid;
BEGIN
  SELECT organization_id INTO merchant_org
  FROM public.users
  WHERE id = auth.uid() AND status = 'active' AND role IN ('business_owner', 'admin', 'cashier');
  IF merchant_org IS NULL THEN RETURN; END IF;
  INSERT INTO public.merchant_app_activity (organization_id, last_opened_at)
  VALUES (merchant_org, statement_timestamp())
  ON CONFLICT (organization_id) DO UPDATE
    SET last_opened_at = EXCLUDED.last_opened_at
    WHERE public.merchant_app_activity.last_opened_at < EXCLUDED.last_opened_at - interval '1 minute';
END $$;
REVOKE ALL ON FUNCTION public.record_merchant_app_open() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_merchant_app_open() TO authenticated;

COMMIT;
