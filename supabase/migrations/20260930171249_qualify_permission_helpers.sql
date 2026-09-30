-- Preserve existing ownership, grants and role predicates. Explicit table names
-- allow these RLS helpers to run inside triggers with an empty search_path.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.is_admin_or_above() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role IN ('platform_owner', 'business_owner', 'admin') FROM public.users WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.is_business_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role = 'business_owner' FROM public.users WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.is_platform_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role = 'platform_owner' FROM public.users WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role = 'super_admin' FROM public.users WHERE id = auth.uid()
$$;
COMMIT;
