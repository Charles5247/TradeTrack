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


DO $$
DECLARE u record; msg text; detail text; affected integer; results jsonb := '[]'::jsonb;
BEGIN
  FOR u IN SELECT DISTINCT ON (role) id,role FROM public.users WHERE status='active' ORDER BY role,id LOOP
    PERFORM set_config('request.jwt.claim.sub',u.id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated')::text,true);
    BEGIN
      SET LOCAL ROLE authenticated;
      UPDATE public.users SET full_name=full_name WHERE id=u.id;
      GET DIAGNOSTICS affected=ROW_COUNT;
      RESET ROLE;
      results := results || jsonb_build_object('role',u.role,'rows',affected,'ok',true);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT,detail=PG_EXCEPTION_CONTEXT;
      RESET ROLE;
      results := results || jsonb_build_object('role',u.role,'code',SQLSTATE,'error',msg,'context',detail);
    END;
  END LOOP;
RAISE EXCEPTION 'ROLLBACK diagnostic: %',results;
END $$;
ROLLBACK;


