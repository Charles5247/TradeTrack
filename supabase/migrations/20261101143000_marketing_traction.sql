BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS marketing_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_public_name text;

CREATE OR REPLACE FUNCTION public.get_marketing_traction()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'businesses', (
      SELECT count(*)::int
      FROM public.organizations
      WHERE subscription_status IN ('active', 'trial')
    ),
    'products', (
      SELECT count(*)::int
      FROM public.products p
      JOIN public.organizations o ON o.id = p.organization_id
      WHERE o.subscription_status IN ('active', 'trial')
    ),
    'transactions', (
      SELECT count(*)::int
      FROM public.sales s
      JOIN public.organizations o ON o.id = s.organization_id
      WHERE s.status = 'completed'
        AND o.subscription_status IN ('active', 'trial')
    ),
    'business_names', COALESCE((
      SELECT jsonb_agg(public_name ORDER BY public_name)
      FROM (
        SELECT trim(COALESCE(marketing_public_name, name)) AS public_name
        FROM public.organizations
        WHERE marketing_public = true
          AND NULLIF(trim(COALESCE(marketing_public_name, name)), '') IS NOT NULL
        LIMIT 30
      ) consented_names
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_marketing_traction() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketing_traction() TO anon, authenticated;

COMMENT ON COLUMN public.organizations.marketing_public IS
  'Explicit opt-in to display the organization in Trackasuwa marketing traction content.';
COMMENT ON COLUMN public.organizations.marketing_public_name IS
  'Optional consented public business name used in Trackasuwa marketing traction content.';

COMMIT;
