BEGIN READ ONLY;
SELECT jsonb_build_object(
 'database',current_database(),
 'postgres_version',current_setting('server_version'),
 'extensions',(SELECT jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname)) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
 'required_tables',(SELECT jsonb_object_agg(t,to_regclass('public.'||t) IS NOT NULL) FROM unnest(ARRAY['organizations','users','subscriptions','subscription_plans','payment_transactions','audit_logs','sales','sale_items','inventory','inventory_movements','purchase_orders','purchase_order_items','vendor_transactions','vendor_transaction_items','products','suppliers','customers','notifications','invoices']) t),
 'existing_new_tables',(SELECT jsonb_agg(tablename) FROM pg_tables WHERE schemaname='public' AND tablename IN ('accounting_counters','financial_reversals','cash_up_closes','import_batches','import_rows','import_reversals','historical_sales','staff_invites','ai_jobs','ai_preferences','ai_deliveries')),
 'existing_new_columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name)) FROM information_schema.columns WHERE table_schema='public' AND ((table_name='organizations' AND column_name IN ('intro_eligible','trial_started_at','trial_ends_at','subscription_period_start')) OR (table_name='sales' AND column_name='official_invoice_number') OR (table_name='audit_logs' AND column_name='row_hash'))),
 'migration_history_exists',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('digest','get_user_org_id','is_admin_or_above','verify_business_subscription')),
 'existing_private_schema',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='track_private')
) AS preflight;
COMMIT;
