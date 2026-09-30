BEGIN READ ONLY;
WITH chain AS (
 SELECT *,lag(row_hash,1,'') OVER(PARTITION BY organization_id ORDER BY sequence_number) expected_prev,
 row_number() OVER(PARTITION BY organization_id ORDER BY sequence_number) expected_sequence
 FROM public.audit_logs WHERE row_hash IS NOT NULL
), numbering AS (
 SELECT organization_id,count(*) n,count(DISTINCT official_invoice_number) unique_numbers,
 min(official_invoice_number) first_number,max(official_invoice_number) last_number
 FROM public.sales GROUP BY organization_id
)
SELECT jsonb_build_object(
 'sales',(SELECT count(*) FROM public.sales),
 'numbered_sales',(SELECT count(*) FROM public.sales WHERE official_invoice_number IS NOT NULL),
 'invoice_sequence_errors',(SELECT count(*) FROM numbering WHERE n<>unique_numbers OR first_number<>1 OR last_number<>n),
 'chained_audit_rows',(SELECT count(*) FROM chain),
 'audit_chain_errors',(SELECT count(*) FROM chain WHERE prev_hash<>expected_prev OR sequence_number<>expected_sequence),
 'audit_hash_errors',(SELECT count(*) FROM public.audit_logs a WHERE row_hash IS NOT NULL AND row_hash<>encode(public.digest(convert_to((to_jsonb(a)-'row_hash')::text,'UTF8'),'sha256'),'hex')),
 'new_tables',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('accounting_counters','financial_reversals','cash_up_closes','import_batches','import_rows','import_reversals','historical_sales','staff_invites','ai_jobs','ai_preferences','ai_deliveries')),
 'required_triggers',(SELECT jsonb_agg(tgname) FROM pg_trigger WHERE tgname IN ('audit_immutable','chain_audit','official_invoice','protect_official_invoice_number','protect_reversal_stock_link','subscription_intro','protect_intro','ai_import_execution')),
 'digest_exposed_to_authenticated',has_function_privilege('authenticated','public.digest(bytea,text)','EXECUTE'),
 'new_rpc_anonymous_grants',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('verify_business_subscription','reverse_financial_sale','close_cash_up','apply_import_row','apply_import_chunk','reverse_import','reserve_ai_job','finish_ai_job','approve_ai_job','set_ai_preferences','reserve_ai_delivery','complete_ai_delivery') AND has_function_privilege('anon',p.oid,'EXECUTE')),
 'new_rpc_missing_authenticated_grants',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('verify_business_subscription','reverse_financial_sale','close_cash_up','apply_import_row','apply_import_chunk','reverse_import','reserve_ai_job','finish_ai_job','approve_ai_job','set_ai_preferences','reserve_ai_delivery','complete_ai_delivery') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')),
 'function_owners',(SELECT jsonb_agg(DISTINCT pg_get_userbyid(p.proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='track_private')
) AS verification;
COMMIT;
