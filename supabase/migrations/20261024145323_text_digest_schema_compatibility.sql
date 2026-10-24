BEGIN;
-- Supabase commonly installs pgcrypto in extensions. Keep the text overload
-- used by stock approval hashes alongside the existing bytea compatibility
-- overload. Delegation preserves pgcrypto's exact text encoding behavior.
DO $migration$
DECLARE extension_schema text;
BEGIN
 IF to_regprocedure('public.digest(text,text)') IS NULL THEN
  SELECT n.nspname INTO extension_schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';
  IF extension_schema IS NULL THEN RAISE EXCEPTION 'pgcrypto is required'; END IF;
  EXECUTE format('CREATE FUNCTION public.digest(text,text) RETURNS bytea LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path='''' AS %L',
    format('SELECT %I.digest($1,$2)',extension_schema));
  REVOKE ALL ON FUNCTION public.digest(text,text) FROM PUBLIC,anon,authenticated,service_role;
 END IF;
END
$migration$;
COMMIT;
