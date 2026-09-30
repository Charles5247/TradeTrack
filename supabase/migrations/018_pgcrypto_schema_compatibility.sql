-- Compatibility prerequisite for 014 on populated hosted databases where
-- pgcrypto is installed in extensions instead of public. This file is safe
-- to run before 014 and again later in ordinary numeric migration order.
BEGIN;
DO $migration$
DECLARE extension_schema text;
BEGIN
 IF to_regprocedure('public.digest(bytea,text)') IS NULL THEN
  SELECT n.nspname INTO extension_schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto';
  IF extension_schema IS NULL THEN RAISE EXCEPTION 'pgcrypto is required'; END IF;
  EXECUTE format('CREATE FUNCTION public.digest(bytea,text) RETURNS bytea LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path='''' AS %L',
    format('SELECT %I.digest($1,$2)',extension_schema));
  -- Only the migration/function owner needs this compatibility entry point.
  REVOKE ALL ON FUNCTION public.digest(bytea,text) FROM PUBLIC,anon,authenticated;
 END IF;
END
$migration$;
COMMIT;
