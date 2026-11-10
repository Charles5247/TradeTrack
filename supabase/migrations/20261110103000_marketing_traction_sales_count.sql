-- Count businesses that have actually recorded a completed sale, not every
-- account with an active trial. Public names still require explicit opt-in.
CREATE OR REPLACE FUNCTION public.get_marketing_traction()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'businesses', (SELECT count(DISTINCT s.organization_id)::int FROM public.sales s WHERE s.status = 'completed'),
    'products', (SELECT count(*)::int FROM public.products p JOIN public.organizations o ON o.id = p.organization_id WHERE o.subscription_status IN ('active','trial')),
    'transactions', (SELECT count(*)::int FROM public.sales s WHERE s.status = 'completed'),
    'business_names', COALESCE((
      SELECT jsonb_agg(public_name ORDER BY public_name)
      FROM (
        SELECT trim(COALESCE(marketing_public_name, name)) AS public_name
        FROM public.organizations
        WHERE marketing_public = true
          AND NULLIF(trim(COALESCE(marketing_public_name, name)), '') IS NOT NULL
        ORDER BY trim(COALESCE(marketing_public_name, name))
        LIMIT 30
      ) consented_names
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_marketing_traction() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_marketing_traction() TO anon, authenticated;
