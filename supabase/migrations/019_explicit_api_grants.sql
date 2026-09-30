-- Hosted Supabase default privileges can grant anon/authenticated privileges
-- directly. Revoking PUBLIC alone does not remove those direct grants.
BEGIN;
DO $migration$
DECLARE fn record; table_name text;
BEGIN
 FOR fn IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
   'verify_business_subscription','reverse_financial_sale','close_cash_up',
   'apply_import_row','apply_import_chunk','reverse_import','reserve_ai_job',
   'finish_ai_job','approve_ai_job','set_ai_preferences','reserve_ai_delivery','complete_ai_delivery'
  ) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',fn.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',fn.signature);
 END LOOP;
 FOR fn IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='track_private' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',fn.signature);
 END LOOP;
 REVOKE ALL ON SCHEMA track_private FROM PUBLIC,anon,authenticated;
 FOREACH table_name IN ARRAY ARRAY['accounting_counters','financial_reversals','cash_up_closes','import_batches','import_rows','import_reversals','historical_sales','staff_invites','ai_jobs','ai_preferences','ai_deliveries'] LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',table_name);
  EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated',table_name);
 END LOOP;
 GRANT INSERT ON public.import_batches TO authenticated;
END
$migration$;
COMMIT;
