BEGIN;

-- Keep existing grants/RLS for reads and exports. Guard business writes at the
-- database boundary, including writes performed by authenticated RPCs.
CREATE OR REPLACE FUNCTION track_private.guard_business_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_data jsonb; org_id uuid;
BEGIN
  -- Server maintenance and payment processing are separate trusted paths.
  IF auth.uid() IS NULL OR public.is_platform_owner() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  org_id := (row_data->>'organization_id')::uuid;
  IF TG_TABLE_NAME = 'sale_items' THEN
    SELECT organization_id INTO org_id FROM public.sales WHERE id=(row_data->>'sale_id')::uuid;
  ELSIF TG_TABLE_NAME = 'purchase_order_items' THEN
    SELECT organization_id INTO org_id FROM public.purchase_orders WHERE id=(row_data->>'purchase_order_id')::uuid;
  ELSIF TG_TABLE_NAME = 'vendor_transaction_items' THEN
    SELECT organization_id INTO org_id FROM public.vendor_transactions WHERE id=(row_data->>'vendor_transaction_id')::uuid;
  END IF;
  IF org_id IS NULL THEN RAISE EXCEPTION 'Business membership required'; END IF;
  PERFORM track_private.assert_active_transaction_access(org_id);
  -- Prevent moving a row out of an expired business to bypass its lock.
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD)->>'organization_id') IS DISTINCT FROM (row_data->>'organization_id') THEN
    PERFORM track_private.assert_active_transaction_access((to_jsonb(OLD)->>'organization_id')::uuid);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_business_write() FROM PUBLIC;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'categories','suppliers','products','warehouses','inventory','inventory_movements',
    'warehouse_transfers','customers','sales','sale_items','vendor_transactions',
    'vendor_transaction_items','purchase_orders','purchase_order_items','settings',
    'financial_reversals','cash_up_closes','import_batches','import_rows',
    'import_reversals','historical_sales','staff_invites','supplier_products','warehouse_staff'
  ] LOOP
    EXECUTE format('CREATE TRIGGER subscription_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.guard_business_write()', table_name);
  END LOOP;
END $$;

-- Protect billing fields from self-service edits; payment service writes still
-- run with no end-user JWT. No records or existing entitlements are rewritten.
CREATE OR REPLACE FUNCTION track_private.guard_organization_billing()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_owner() THEN
    IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
       OR NEW.subscription_plan_id IS DISTINCT FROM OLD.subscription_plan_id
       OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
      RAISE EXCEPTION 'Subscription activation requires server-confirmed payment';
    END IF;
    PERFORM track_private.assert_active_transaction_access(OLD.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_organization_billing() FROM PUBLIC;
CREATE TRIGGER subscription_organization_guard BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION track_private.guard_organization_billing();

CREATE OR REPLACE FUNCTION track_private.guard_trial_product_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE trial_end timestamptz; product_count bigint;
BEGIN
  -- Serialize product additions for this business, including bulk imports.
  SELECT trial_ends_at INTO trial_end FROM public.organizations
    WHERE id=NEW.organization_id FOR UPDATE;
  IF trial_end > statement_timestamp() AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions WHERE organization_id=NEW.organization_id
      AND status='active' AND starts_at<=statement_timestamp() AND expires_at>statement_timestamp()
  ) THEN
    SELECT count(*) INTO product_count FROM public.products WHERE organization_id=NEW.organization_id;
    IF product_count >= 700 AND NOT EXISTS (SELECT 1 FROM public.products WHERE id=NEW.id) THEN
      RAISE EXCEPTION 'Trial product limit reached (700 products)';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_trial_product_limit() FROM PUBLIC;
CREATE TRIGGER trial_product_limit BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION track_private.guard_trial_product_limit();

-- Trial identities are private, normalized, and unique under concurrent signup.
CREATE TABLE track_private.trial_identities (
  identity text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE
);
REVOKE ALL ON TABLE track_private.trial_identities FROM PUBLIC, anon, authenticated;
CREATE FUNCTION track_private.trial_phone(value text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN digits ~ '^0[0-9]{10}$' THEN '234'||substr(digits,2)
    WHEN digits ~ '^234[0-9]{10}$' THEN digits ELSE NULL END
  FROM (SELECT regexp_replace(COALESCE(value,''),'[^0-9]','','g') digits) p
$$;
REVOKE ALL ON FUNCTION track_private.trial_phone(text) FROM PUBLIC;
INSERT INTO track_private.trial_identities(identity,organization_id)
SELECT DISTINCT ON (identity) identity,id FROM (
  SELECT 'email:'||lower(btrim(email)) identity,id,created_at FROM public.organizations
    WHERE trial_started_at IS NOT NULL AND NULLIF(btrim(email),'') IS NOT NULL
  UNION ALL
  SELECT 'phone:'||track_private.trial_phone(phone),id,created_at FROM public.organizations
    WHERE trial_started_at IS NOT NULL AND track_private.trial_phone(phone) IS NOT NULL
) identities ORDER BY identity,created_at,id ON CONFLICT DO NOTHING;
CREATE FUNCTION track_private.claim_trial_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.trial_started_at IS NOT NULL THEN
    IF NULLIF(btrim(NEW.email),'') IS NOT NULL THEN
      INSERT INTO track_private.trial_identities VALUES ('email:'||lower(btrim(NEW.email)),NEW.id);
    END IF;
    IF track_private.trial_phone(NEW.phone) IS NOT NULL THEN
      INSERT INTO track_private.trial_identities VALUES ('phone:'||track_private.trial_phone(NEW.phone),NEW.id);
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A trial already exists for this email or phone. Sign in or contact support to recover your account.';
END $$;
REVOKE ALL ON FUNCTION track_private.claim_trial_identity() FROM PUBLIC;
CREATE TRIGGER claim_trial_identity AFTER INSERT ON public.organizations
FOR EACH ROW EXECUTE FUNCTION track_private.claim_trial_identity();

-- Read-only and archived are derived from server time, so no scheduler can
-- accidentally delete data or delay expiry. Archived records remain retained.
CREATE FUNCTION public.business_access_state() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; deadline timestamptz;
BEGIN
  result := public.verify_business_subscription();
  deadline := COALESCE((result->>'valid_until')::timestamptz,(result->>'trial_ends_at')::timestamptz);
  RETURN result || jsonb_build_object(
    'access_mode', CASE WHEN (result->>'active')::boolean THEN 'active'
      WHEN deadline + interval '90 days' <= statement_timestamp() THEN 'archived' ELSE 'read_only' END,
    'archive_at', deadline + interval '90 days');
END $$;
REVOKE ALL ON FUNCTION public.business_access_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.business_access_state() TO authenticated;

COMMIT;
