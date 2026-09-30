BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE deployment_baseline ON COMMIT DROP AS SELECT
 (SELECT md5(COALESCE(string_agg((to_jsonb(s)-ARRAY['official_invoice_number','updated_at','original_device_timestamp'])::text,'' ORDER BY s.id),'')) FROM public.sales s) sales_hash,
 (SELECT md5(COALESCE(string_agg((to_jsonb(i)-ARRAY['original_device_timestamp','import_batch_id'])::text,'' ORDER BY i.id),'')) FROM public.inventory i) inventory_hash;

-- Source: 018_pgcrypto_schema_compatibility.sql
-- Compatibility prerequisite for 014 on populated hosted databases where
-- pgcrypto is installed in extensions instead of public. This file is safe
-- to run before 014 and again later in ordinary numeric migration order.

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

-- Source: 014_accounting_controls.sql
-- TracKasuwa accounting controls. Existing records remain intact.

ALTER TABLE public.audit_logs ADD COLUMN actor_role text;
ALTER TABLE public.audit_logs ADD COLUMN device_id text;
ALTER TABLE public.audit_logs ADD COLUMN device_timestamp timestamptz;
ALTER TABLE public.audit_logs ADD COLUMN correlation_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN sequence_number bigint;
ALTER TABLE public.audit_logs ADD COLUMN prev_hash text;
ALTER TABLE public.audit_logs ADD COLUMN row_hash text;
CREATE UNIQUE INDEX audit_org_sequence ON public.audit_logs(organization_id, sequence_number);
CREATE TABLE public.accounting_counters (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  audit_number bigint NOT NULL DEFAULT 0, audit_hash text NOT NULL DEFAULT '', invoice_number bigint NOT NULL DEFAULT 0
);
ALTER TABLE public.accounting_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY counters_read ON public.accounting_counters FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id() AND public.is_admin_or_above());
GRANT SELECT ON public.accounting_counters TO authenticated;

CREATE FUNCTION track_private.immutable_record() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'This record is immutable. Use a reasoned reversal entry.'; END $$;
REVOKE ALL ON FUNCTION track_private.immutable_record() FROM PUBLIC;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();

CREATE FUNCTION track_private.chain_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n bigint; h text;
BEGIN
  INSERT INTO public.accounting_counters(organization_id) VALUES(NEW.organization_id) ON CONFLICT DO NOTHING;
  SELECT audit_number+1,audit_hash INTO n,h FROM public.accounting_counters WHERE organization_id=NEW.organization_id FOR UPDATE;
  IF auth.uid() IS NOT NULL AND COALESCE(auth.jwt()->>'role','')<>'service_role' THEN NEW.user_id:=auth.uid(); END IF;
  NEW.created_at := clock_timestamp();
  NEW.sequence_number := n; NEW.prev_hash := h;
  NEW.actor_role := COALESCE((SELECT role FROM public.users WHERE id=NEW.user_id),'system');
  NEW.device_id := COALESCE(NEW.device_id, NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-track-device','server');
  NEW.device_timestamp := COALESCE(NEW.device_timestamp, NEW.created_at);
  NEW.correlation_id := COALESCE(NEW.correlation_id,gen_random_uuid());
  NEW.row_hash := encode(public.digest(convert_to((to_jsonb(NEW)-'row_hash')::text,'UTF8'),'sha256'),'hex');
  UPDATE public.accounting_counters SET audit_number=n,audit_hash=NEW.row_hash WHERE organization_id=NEW.organization_id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.chain_audit() FROM PUBLIC;
CREATE TRIGGER chain_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION track_private.chain_audit();

CREATE FUNCTION track_private.capture_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb:=to_jsonb(NEW); org uuid; actor uuid;
BEGIN
  org := (v->>'organization_id')::uuid;
  IF TG_TABLE_NAME='sale_items' THEN SELECT organization_id INTO org FROM public.sales WHERE id=(v->>'sale_id')::uuid; END IF;
  actor:=COALESCE(auth.uid(),(v->>'created_by')::uuid,(v->>'cashier_id')::uuid);
  IF org IS NOT NULL THEN
    INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,old_values,new_values,reason,device_timestamp,correlation_id)
    VALUES(org,actor,TG_OP,TG_TABLE_NAME,(v->>'id')::uuid,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,v,
      COALESCE(v->>'reason',v->>'notes','Database change'),COALESCE((v->>'original_device_timestamp')::timestamptz,(v->>'created_at')::timestamptz,clock_timestamp()),
      COALESCE((v->>'import_batch_id')::uuid,(v->>'correlation_id')::uuid));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.capture_audit() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_items','inventory','inventory_movements','purchase_orders','vendor_transactions','subscriptions','users','products'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN original_device_timestamp timestamptz',t);
    EXECUTE format('CREATE TRIGGER accounting_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit()',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['sales','sale_items','inventory_movements','purchase_orders','purchase_order_items','vendor_transactions','vendor_transaction_items','subscriptions','payment_transactions','invoices'] LOOP
    EXECUTE format('CREATE TRIGGER no_financial_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record()',t);
  END LOOP;
END $$;

ALTER TABLE public.sales ADD COLUMN official_invoice_number bigint;
CREATE UNIQUE INDEX sales_official_invoice ON public.sales(organization_id,official_invoice_number);
CREATE FUNCTION track_private.number_invoice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing bigint;
BEGIN
  INSERT INTO public.accounting_counters(organization_id) VALUES(NEW.organization_id) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM public.accounting_counters WHERE organization_id=NEW.organization_id FOR UPDATE;
  SELECT official_invoice_number INTO existing FROM public.sales WHERE id=NEW.id;
  IF FOUND THEN NEW.official_invoice_number:=existing; RETURN NEW; END IF;
  UPDATE public.accounting_counters SET invoice_number=invoice_number+1 WHERE organization_id=NEW.organization_id RETURNING invoice_number INTO NEW.official_invoice_number;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.number_invoice() FROM PUBLIC;
CREATE TRIGGER official_invoice BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION track_private.number_invoice();

CREATE TABLE public.financial_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id), kind text NOT NULL CHECK(kind IN ('void','refund','return','vendor_payment_correction')),
  reason text NOT NULL CHECK(length(trim(reason))>=3), amount numeric(12,2) NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sale_id,kind)
);
ALTER TABLE public.financial_reversals ENABLE ROW LEVEL SECURITY;
CREATE POLICY reversals_read ON public.financial_reversals FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id() AND public.is_admin_or_above());
GRANT SELECT ON public.financial_reversals TO authenticated;
CREATE TRIGGER reversal_immutable BEFORE UPDATE OR DELETE ON public.financial_reversals FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();
CREATE TRIGGER reversal_audit AFTER INSERT ON public.financial_reversals FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit();
CREATE FUNCTION public.reverse_financial_sale(target uuid, reversal_kind text, reversal_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sales; result uuid; line record; actor public.users;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('business_owner','admin') THEN RAISE EXCEPTION 'Owner or manager permission required'; END IF;
  IF length(trim(reversal_reason))<3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO s FROM public.sales WHERE id=target AND organization_id=actor.organization_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.financial_reversals WHERE sale_id=target AND kind IN ('void','refund','return')) THEN RAISE EXCEPTION 'Sale already reversed'; END IF;
  IF reversal_kind='vendor_payment_correction' AND NOT EXISTS(
    SELECT 1 FROM public.vendor_transactions v WHERE v.organization_id=s.organization_id AND s.notes='Vendor transaction '||v.id::text AND v.amount_paid>=v.total_value
  ) THEN RAISE EXCEPTION 'Vendor payment is not confirmed'; END IF;
  INSERT INTO public.financial_reversals(organization_id,sale_id,kind,reason,amount,created_by)
    VALUES(s.organization_id,s.id,reversal_kind,reversal_reason,CASE WHEN reversal_kind='vendor_payment_correction' THEN s.total-s.amount_paid ELSE -s.total END,actor.id) RETURNING id INTO result;
  IF reversal_kind IN ('void','refund','return') THEN
    IF EXISTS(SELECT 1 FROM public.sale_items WHERE sale_id=s.id) AND NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE organization_id=s.organization_id AND original_device_timestamp=s.created_at AND reference_type='inventory_ledger') THEN
      RAISE EXCEPTION 'Stock has not reconciled. Sync and review stock before reversing this sale';
    END IF;
    PERFORM set_config('track.reason',reversal_reason,true);
    FOR line IN SELECT m.product_id,m.warehouse_id,-sum(m.quantity)::integer quantity FROM public.inventory_movements m
      WHERE m.organization_id=s.organization_id AND m.original_device_timestamp=s.created_at AND m.reference_type='inventory_ledger' AND m.quantity<0
      GROUP BY m.product_id,m.warehouse_id LOOP
      UPDATE public.inventory SET quantity=quantity+line.quantity,original_device_timestamp=NULL WHERE product_id=line.product_id AND warehouse_id=line.warehouse_id AND organization_id=s.organization_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Inventory missing; reconcile before reversal'; END IF;
    END LOOP;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reverse_financial_sale(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_financial_sale(uuid,text,text) TO authenticated;

CREATE FUNCTION track_private.record_stock_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE delta integer;
BEGIN
  delta:=NEW.quantity-CASE WHEN TG_OP='INSERT' THEN 0 ELSE OLD.quantity END;
  IF delta<>0 THEN
    INSERT INTO public.inventory_movements(organization_id,product_id,warehouse_id,movement_type,quantity,reference_id,reference_type,notes,created_by,original_device_timestamp)
    VALUES(NEW.organization_id,NEW.product_id,NEW.warehouse_id,'adjustment',delta,NEW.id,'inventory_ledger',COALESCE(NULLIF(current_setting('track.reason',true),''),'Server-recorded stock change'),auth.uid(),NEW.original_device_timestamp);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.record_stock_change() FROM PUBLIC;
CREATE TRIGGER stock_ledger AFTER INSERT OR UPDATE OF quantity ON public.inventory FOR EACH ROW EXECUTE FUNCTION track_private.record_stock_change();

CREATE TABLE public.cash_up_closes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
  cashier_id uuid NOT NULL REFERENCES public.users(id), opened_at timestamptz NOT NULL, closed_at timestamptz NOT NULL DEFAULT now(),
  expected jsonb NOT NULL, counted jsonb NOT NULL, variance jsonb NOT NULL,
  reason text NOT NULL, signed_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(closed_at>opened_at)
);
ALTER TABLE public.cash_up_closes ENABLE ROW LEVEL SECURITY;
CREATE POLICY closes_read ON public.cash_up_closes FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id() AND public.is_admin_or_above());
GRANT SELECT ON public.cash_up_closes TO authenticated;
CREATE TRIGGER closes_immutable BEFORE UPDATE OR DELETE ON public.cash_up_closes FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();
CREATE TRIGGER closes_audit AFTER INSERT ON public.cash_up_closes FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit();

CREATE FUNCTION public.close_cash_up(cashier uuid, opened timestamptz, counted_values jsonb, close_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; expected_values jsonb; variance_values jsonb; result uuid;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('business_owner','admin') THEN RAISE EXCEPTION 'Owner or manager sign-off required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=cashier AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Invalid cashier'; END IF;
  IF opened>=now() OR length(trim(close_reason))<3 THEN RAISE EXCEPTION 'Valid period and reason required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(cashier::text,0));
  IF EXISTS(SELECT 1 FROM public.cash_up_closes WHERE cashier_id=cashier AND closed_at>opened) THEN RAISE EXCEPTION 'Overlapping closed shift'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each_text(counted_values) e WHERE e.value::numeric<0 OR e.key NOT IN ('cash','transfer','pos_terminal','split','partial')) THEN RAISE EXCEPTION 'Invalid counted amounts'; END IF;
  SELECT COALESCE(jsonb_object_agg(payment_method,total),'{}') INTO expected_values FROM
    (SELECT payment_method,sum(amount_paid-change_amount) total FROM public.sales s WHERE organization_id=actor.organization_id AND cashier_id=cashier AND created_at>=opened AND created_at<now()
      AND NOT EXISTS(SELECT 1 FROM public.financial_reversals r WHERE r.sale_id=s.id AND kind IN ('void','refund','return')) GROUP BY payment_method) q;
  SELECT jsonb_object_agg(k, COALESCE((counted_values->>k)::numeric,0)-COALESCE((expected_values->>k)::numeric,0)) INTO variance_values FROM unnest(ARRAY['cash','transfer','pos_terminal','split','partial']) k;
  INSERT INTO public.cash_up_closes(organization_id,cashier_id,opened_at,expected,counted,variance,reason,signed_by)
    VALUES(actor.organization_id,cashier,opened,expected_values,counted_values,variance_values,close_reason,actor.id) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.close_cash_up(uuid,timestamptz,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_cash_up(uuid,timestamptz,jsonb,text) TO authenticated;

CREATE FUNCTION track_private.guard_financial_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE role_name text; allowed numeric; listed numeric; sold integer;
BEGIN
  SELECT role INTO role_name FROM public.users WHERE id=auth.uid();
  IF TG_TABLE_NAME='sales' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['updated_at','official_invoice_number']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','official_invoice_number']) THEN
    RAISE EXCEPTION 'Sales are immutable; use a reversal or payment correction';
  END IF;
  IF role_name='cashier' THEN
    IF TG_TABLE_NAME='sales' THEN
      IF NEW.cashier_id<>auth.uid() THEN RAISE EXCEPTION 'Invalid cashier'; END IF;
      IF NEW.discount<>0 THEN RAISE EXCEPTION 'Manager approval is required for discounts'; END IF;
    END IF;
    IF TG_TABLE_NAME='sale_items' THEN
      SELECT selling_price INTO listed FROM public.products WHERE id=NEW.product_id;
      IF NEW.discount<>0 OR NEW.unit_price IS DISTINCT FROM listed THEN RAISE EXCEPTION 'Manager approval is required for price changes'; END IF;
    END IF;
    IF TG_TABLE_NAME='inventory' THEN
      IF TG_OP<>'UPDATE' OR NEW.original_device_timestamp IS NULL OR NEW.quantity>OLD.quantity THEN RAISE EXCEPTION 'Cashiers cannot adjust stock'; END IF;
      SELECT sum(i.quantity) INTO sold FROM public.sale_items i JOIN public.sales s ON s.id=i.sale_id
        WHERE s.cashier_id=auth.uid() AND s.organization_id=NEW.organization_id AND s.created_at=NEW.original_device_timestamp
          AND i.product_id=NEW.product_id AND i.warehouse_id=NEW.warehouse_id;
      IF sold IS NULL OR NEW.quantity<>greatest(0,OLD.quantity-sold) OR EXISTS(
        SELECT 1 FROM public.inventory_movements WHERE reference_type='inventory_ledger' AND reference_id=NEW.id AND original_device_timestamp=NEW.original_device_timestamp
      ) THEN RAISE EXCEPTION 'Stock change must match an unreconciled cashier sale'; END IF;
      IF (to_jsonb(NEW)-ARRAY['quantity','updated_at','original_device_timestamp']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['quantity','updated_at','original_device_timestamp']) THEN RAISE EXCEPTION 'Cashiers cannot edit inventory'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sale_controls BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION track_private.guard_financial_change();
CREATE TRIGGER item_controls BEFORE INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION track_private.guard_financial_change();
CREATE TRIGGER stock_controls BEFORE INSERT OR UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION track_private.guard_financial_change();
CREATE POLICY cashier_sale_stock_update ON public.inventory FOR UPDATE TO authenticated USING (organization_id=public.get_user_org_id()) WITH CHECK (organization_id=public.get_user_org_id());
CREATE TRIGGER item_immutable BEFORE UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();

CREATE FUNCTION track_private.protect_user_role() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE caller_role text;
BEGIN
  IF auth.uid() IS NULL OR COALESCE(auth.jwt()->>'role','')='service_role' THEN RETURN NEW; END IF;
  SELECT role INTO caller_role FROM public.users WHERE id=auth.uid();
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF caller_role IS DISTINCT FROM 'platform_owner' AND NOT(caller_role='business_owner' AND OLD.organization_id=public.get_user_org_id() AND NEW.organization_id=OLD.organization_id AND NEW.role IN ('admin','cashier') AND OLD.role IN ('admin','cashier')) THEN
      RAISE EXCEPTION 'Role and membership changes require owner permission';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_user_role BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION track_private.protect_user_role();
WITH numbered AS (SELECT id,row_number() OVER(PARTITION BY organization_id ORDER BY created_at,id) n FROM public.sales)
UPDATE public.sales s SET official_invoice_number=n.n FROM numbered n WHERE s.id=n.id AND s.official_invoice_number IS NULL;
INSERT INTO public.accounting_counters(organization_id,invoice_number)
SELECT organization_id,max(official_invoice_number) FROM public.sales GROUP BY organization_id
ON CONFLICT(organization_id) DO UPDATE SET invoice_number=excluded.invoice_number;

-- Source: 015_business_imports.sql

CREATE TABLE public.import_batches (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 kind text NOT NULL CHECK(kind IN ('products','suppliers','customers','historical_sales','staff_invites')),
 summary jsonb NOT NULL DEFAULT '{}', created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.import_rows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 import_batch_id uuid NOT NULL REFERENCES public.import_batches(id), row_number integer NOT NULL,
 entity_id uuid, target_type text NOT NULL, outcome text NOT NULL CHECK(outcome IN ('create','update','skip','error')),
 error text, before_values jsonb, after_values jsonb, warehouse_id uuid, opening_stock integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(import_batch_id,row_number)
);
CREATE TABLE public.import_reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 import_batch_id uuid NOT NULL UNIQUE REFERENCES public.import_batches(id), reason text NOT NULL CHECK(length(trim(reason))>=3),
 created_by uuid NOT NULL REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.historical_sales (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id), import_batch_id uuid NOT NULL REFERENCES public.import_batches(id),
 invoice_number text NOT NULL, sold_at timestamptz NOT NULL, total numeric(12,2) NOT NULL CHECK(total>=0),
 amount_paid numeric(12,2) NOT NULL CHECK(amount_paid>=0), payment_method text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','reversed')), imported boolean NOT NULL DEFAULT true CHECK(imported),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.staff_invites (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id), import_batch_id uuid NOT NULL REFERENCES public.import_batches(id),
 name text NOT NULL, email text NOT NULL, role text NOT NULL CHECK(role IN ('admin','cashier')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,email)
);
ALTER TABLE public.products ADD COLUMN import_batch_id uuid REFERENCES public.import_batches(id);
ALTER TABLE public.inventory ADD COLUMN import_batch_id uuid REFERENCES public.import_batches(id);
ALTER TABLE public.suppliers ADD COLUMN import_batch_id uuid REFERENCES public.import_batches(id);
ALTER TABLE public.customers ADD COLUMN import_batch_id uuid REFERENCES public.import_batches(id);
ALTER TABLE public.suppliers ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive'));
ALTER TABLE public.customers ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive'));
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['import_batches','import_rows','import_reversals','historical_sales','staff_invites'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY import_read ON public.%I FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id() AND public.is_admin_or_above())',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE INDEX ON public.%I(organization_id)',t);
  EXECUTE format('CREATE TRIGGER import_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit()',t);
  EXECUTE format('CREATE TRIGGER import_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record()',t);
 END LOOP;
END $$;
CREATE POLICY batch_insert ON public.import_batches FOR INSERT TO authenticated WITH CHECK(organization_id=public.get_user_org_id() AND created_by=auth.uid() AND public.is_admin_or_above());
GRANT INSERT ON public.import_batches TO authenticated;
CREATE TRIGGER import_row_immutable BEFORE UPDATE ON public.import_rows FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();
CREATE TRIGGER import_reversal_immutable BEFORE UPDATE ON public.import_reversals FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();
CREATE TRIGGER supplier_import_audit AFTER INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit();
CREATE TRIGGER customer_import_audit AFTER INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit();

CREATE FUNCTION public.apply_import_row(batch uuid,row_index integer,row_data jsonb,duplicate_mode text,warehouse uuid,proposed_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; b public.import_batches; existing uuid; target uuid; before_row jsonb; after_row jsonb; result public.import_rows;
 tab text; matches integer; outcome text:='create'; qty integer:=0; err text;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
 IF actor.id IS NULL OR actor.role NOT IN ('business_owner','admin') THEN RAISE EXCEPTION 'Owner or manager required'; END IF;
 SELECT * INTO b FROM public.import_batches WHERE id=batch AND organization_id=actor.organization_id FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'Import batch not found'; END IF;
 IF b.kind='staff_invites' AND actor.role<>'business_owner' THEN RAISE EXCEPTION 'Staff invitations are owner-only'; END IF;
 IF EXISTS(SELECT 1 FROM public.import_reversals WHERE import_batch_id=batch) THEN RAISE EXCEPTION 'Batch already reversed'; END IF;
 SELECT * INTO result FROM public.import_rows WHERE import_batch_id=batch AND row_number=row_index;
 IF FOUND THEN RETURN to_jsonb(result); END IF;
 IF duplicate_mode NOT IN ('skip','update','create') OR row_index<1 THEN RAISE EXCEPTION 'Invalid import options'; END IF;
 tab:=b.kind;
 BEGIN
  IF tab='products' THEN
   IF COALESCE(trim(row_data->>'name'),'')='' OR COALESCE(trim(row_data->>'sku'),'')='' THEN RAISE EXCEPTION 'Name and SKU required'; END IF;
   SELECT count(*),min(id::text)::uuid INTO matches,existing FROM public.products WHERE organization_id=actor.organization_id AND (lower(sku)=lower(row_data->>'sku') OR (NULLIF(row_data->>'barcode','') IS NOT NULL AND barcode=row_data->>'barcode'));
   qty:=COALESCE(NULLIF(row_data->>'opening_stock',''),'0')::integer;
   IF qty<0 OR COALESCE(NULLIF(row_data->>'selling_price',''),'0')::numeric<0 OR COALESCE(NULLIF(row_data->>'cost_price',''),'0')::numeric<0 THEN RAISE EXCEPTION 'Prices and stock must be non-negative'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=warehouse AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Choose a warehouse in your business'; END IF;
  ELSIF tab IN ('suppliers','customers','staff_invites') THEN
   IF COALESCE(trim(row_data->>'name'),'')='' THEN RAISE EXCEPTION 'Name required'; END IF;
   IF tab='staff_invites' THEN
    IF COALESCE(row_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR row_data->>'role' NOT IN ('admin','cashier') THEN RAISE EXCEPTION 'Valid email and staff role required'; END IF;
    SELECT count(*),min(id::text)::uuid INTO matches,existing FROM public.staff_invites WHERE organization_id=actor.organization_id AND lower(email)=lower(row_data->>'email');
   ELSE
    EXECUTE format('SELECT count(*),min(id::text)::uuid FROM public.%I WHERE organization_id=$1 AND ((nullif($2,'''') IS NOT NULL AND lower(email)=lower($2)) OR (nullif($3,'''') IS NOT NULL AND phone=$3))',tab) INTO matches,existing USING actor.organization_id,row_data->>'email',row_data->>'phone';
   END IF;
  ELSE
   IF COALESCE(trim(row_data->>'invoice_number'),'')='' THEN RAISE EXCEPTION 'Invoice reference required'; END IF;
   SELECT count(*),min(id::text)::uuid INTO matches,existing FROM public.historical_sales WHERE organization_id=actor.organization_id AND invoice_number=row_data->>'invoice_number';
   IF row_data->>'payment_method' NOT IN ('cash','transfer','pos_terminal','split','partial') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  END IF;
  IF matches>1 THEN RAISE EXCEPTION 'Multiple records match; resolve identifiers first'; END IF;
  IF existing IS NOT NULL AND duplicate_mode='skip' THEN outcome:='skip'; target:=existing;
  ELSE
   target:=CASE WHEN existing IS NOT NULL AND duplicate_mode='update' THEN existing ELSE proposed_id END;
   IF target IS NULL THEN RAISE EXCEPTION 'Record ID required'; END IF;
   IF existing IS NOT NULL AND duplicate_mode='update' THEN
    outcome:='update';
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND organization_id=$2 FOR UPDATE',tab) INTO before_row USING existing,actor.organization_id;
   END IF;
   IF tab='products' THEN
    IF outcome='update' THEN
     IF qty<>0 THEN RAISE EXCEPTION 'Opening stock is only for new products; use an attributable stock adjustment for existing products'; END IF;
     UPDATE public.products SET name=row_data->>'name',sku=row_data->>'sku',barcode=NULLIF(row_data->>'barcode',''),selling_price=COALESCE(NULLIF(row_data->>'selling_price',''),'0')::numeric,cost_price=COALESCE(NULLIF(row_data->>'cost_price',''),'0')::numeric,import_batch_id=batch WHERE id=target;
    ELSE
     INSERT INTO public.products(id,organization_id,name,sku,barcode,selling_price,cost_price,created_by,import_batch_id) VALUES(target,actor.organization_id,row_data->>'name',row_data->>'sku',NULLIF(row_data->>'barcode',''),COALESCE(NULLIF(row_data->>'selling_price',''),'0')::numeric,COALESCE(NULLIF(row_data->>'cost_price',''),'0')::numeric,actor.id,batch);
     IF qty>0 THEN
      PERFORM set_config('track.reason','Opening stock from import '||batch::text,true);
      INSERT INTO public.inventory(id,organization_id,product_id,warehouse_id,quantity,import_batch_id) VALUES(COALESCE(NULLIF(row_data->>'inventory_id','')::uuid,gen_random_uuid()),actor.organization_id,target,warehouse,qty,batch);
     END IF;
    END IF;
   ELSIF tab IN ('suppliers','customers') THEN
    IF outcome='update' THEN
     EXECUTE format('UPDATE public.%I SET name=$1,email=nullif($2,''''),phone=nullif($3,''''),address=$4,import_batch_id=$5 WHERE id=$6',tab) USING row_data->>'name',row_data->>'email',row_data->>'phone',row_data->>'address',batch,target;
    ELSE
     EXECUTE format('INSERT INTO public.%I(id,organization_id,name,email,phone,address,import_batch_id) VALUES($1,$2,$3,nullif($4,''''),nullif($5,''''),$6,$7)',tab) USING target,actor.organization_id,row_data->>'name',row_data->>'email',row_data->>'phone',row_data->>'address',batch;
    END IF;
   ELSIF tab='staff_invites' THEN
    IF outcome='update' THEN
     UPDATE public.staff_invites SET name=row_data->>'name',role=row_data->>'role',import_batch_id=batch WHERE id=target AND status='pending';
     IF NOT FOUND THEN RAISE EXCEPTION 'Only pending invitations can be updated'; END IF;
    ELSE INSERT INTO public.staff_invites(id,organization_id,import_batch_id,name,email,role) VALUES(target,actor.organization_id,batch,row_data->>'name',lower(row_data->>'email'),row_data->>'role'); END IF;
   ELSE
    IF outcome='update' THEN RAISE EXCEPTION 'Historical sales are immutable'; END IF;
    INSERT INTO public.historical_sales(id,organization_id,import_batch_id,invoice_number,sold_at,total,amount_paid,payment_method) VALUES(target,actor.organization_id,batch,row_data->>'invoice_number',(row_data->>'sold_at')::timestamptz,(row_data->>'total')::numeric,COALESCE(NULLIF(row_data->>'amount_paid',''),'0')::numeric,row_data->>'payment_method');
   END IF;
   EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1',tab) INTO after_row USING target;
  END IF;
 EXCEPTION WHEN OTHERS THEN outcome:='error';err:=SQLERRM;target:=NULL;before_row:=NULL;after_row:=NULL;qty:=0;
 END;
 INSERT INTO public.import_rows(organization_id,import_batch_id,row_number,entity_id,target_type,outcome,error,before_values,after_values,warehouse_id,opening_stock)
 VALUES(actor.organization_id,batch,row_index,target,tab,outcome,err,before_row,after_row,warehouse,qty) RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.apply_import_row(uuid,integer,jsonb,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_import_row(uuid,integer,jsonb,text,uuid,uuid) TO authenticated;
CREATE FUNCTION public.apply_import_chunk(batch uuid, import_rows jsonb, duplicate_mode text, warehouse uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE row jsonb; result jsonb:='[]'; BEGIN
 IF jsonb_typeof(import_rows)<>'array' OR jsonb_array_length(import_rows)>100 THEN RAISE EXCEPTION 'Send at most 100 rows per chunk'; END IF;
 FOR row IN SELECT * FROM jsonb_array_elements(import_rows) LOOP
  result:=result||jsonb_build_array(public.apply_import_row(batch,(row->>'index')::integer,row->'data',duplicate_mode,warehouse,(row->>'id')::uuid));
 END LOOP; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_import_chunk(uuid,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_import_chunk(uuid,jsonb,text,uuid) TO authenticated;

CREATE FUNCTION public.reverse_import(batch uuid, reversal_reason text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; r public.import_rows; current_row jsonb; result uuid;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
 IF actor.id IS NULL OR actor.role NOT IN ('business_owner','admin') THEN RAISE EXCEPTION 'Owner or manager required'; END IF;
 PERFORM 1 FROM public.import_batches WHERE id=batch AND organization_id=actor.organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
 INSERT INTO public.import_reversals(organization_id,import_batch_id,reason,created_by) VALUES(actor.organization_id,batch,reversal_reason,actor.id) RETURNING id INTO result;
 FOR r IN SELECT * FROM public.import_rows WHERE import_batch_id=batch AND outcome IN ('create','update') ORDER BY row_number DESC LOOP
  IF r.target_type='staff_invites' AND actor.role<>'business_owner' THEN RAISE EXCEPTION 'Staff invitations are owner-only'; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',r.target_type) INTO current_row USING r.entity_id;
  IF (current_row-'updated_at') IS DISTINCT FROM (r.after_values-'updated_at') THEN RAISE EXCEPTION 'A record changed after import; review before reversing'; END IF;
  IF r.target_type='products' THEN
   IF r.opening_stock>0 THEN
    PERFORM set_config('track.reason',reversal_reason,true);
    UPDATE public.inventory SET quantity=quantity-r.opening_stock WHERE product_id=r.entity_id AND warehouse_id=r.warehouse_id AND quantity>=r.opening_stock;
    IF NOT FOUND THEN RAISE EXCEPTION 'Opening stock has been consumed; reconcile before reversing'; END IF;
   END IF;
   IF r.outcome='create' THEN UPDATE public.products SET status='inactive' WHERE id=r.entity_id;
   ELSE UPDATE public.products SET name=r.before_values->>'name',sku=r.before_values->>'sku',barcode=r.before_values->>'barcode',selling_price=(r.before_values->>'selling_price')::numeric,cost_price=(r.before_values->>'cost_price')::numeric,import_batch_id=(r.before_values->>'import_batch_id')::uuid WHERE id=r.entity_id; END IF;
  ELSIF r.outcome='create' THEN
   EXECUTE format('UPDATE public.%I SET status=$1 WHERE id=$2',r.target_type) USING CASE r.target_type WHEN 'historical_sales' THEN 'reversed' WHEN 'staff_invites' THEN 'cancelled' ELSE 'inactive' END,r.entity_id;
  ELSIF r.target_type='staff_invites' THEN
   UPDATE public.staff_invites SET name=r.before_values->>'name',role=r.before_values->>'role',import_batch_id=(r.before_values->>'import_batch_id')::uuid WHERE id=r.entity_id;
  ELSE
   EXECUTE format('UPDATE public.%I SET name=$1,email=$2,phone=$3,address=$4,import_batch_id=$5 WHERE id=$6',r.target_type) USING r.before_values->>'name',r.before_values->>'email',r.before_values->>'phone',r.before_values->>'address',(r.before_values->>'import_batch_id')::uuid,r.entity_id;
  END IF;
 END LOOP; RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reverse_import(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_import(uuid,text) TO authenticated;
CREATE FUNCTION track_private.import_summary() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='import_reversals' THEN
  UPDATE public.import_batches SET summary=summary||'{"reversed":true}'::jsonb WHERE id=NEW.import_batch_id;
 ELSE
  UPDATE public.import_batches SET summary=jsonb_set(summary,ARRAY[NEW.outcome],to_jsonb(COALESCE((summary->>NEW.outcome)::integer,0)+1)) WHERE id=NEW.import_batch_id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.import_summary() FROM PUBLIC;
CREATE TRIGGER import_summary AFTER INSERT ON public.import_rows FOR EACH ROW EXECUTE FUNCTION track_private.import_summary();
CREATE TRIGGER reversal_summary AFTER INSERT ON public.import_reversals FOR EACH ROW EXECUTE FUNCTION track_private.import_summary();

-- Source: 016_ai_assistant_plumbing.sql

CREATE TABLE public.ai_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 user_id uuid NOT NULL REFERENCES public.users(id), kind text NOT NULL CHECK(kind IN ('inventory','insights')),
 result jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed')),
 approved_at timestamptz, import_batch_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 user_id uuid NOT NULL UNIQUE REFERENCES public.users(id), in_app boolean NOT NULL DEFAULT false, email boolean NOT NULL DEFAULT false, sms boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 user_id uuid NOT NULL REFERENCES public.users(id), job_id uuid NOT NULL REFERENCES public.ai_jobs(id),
 channel text NOT NULL CHECK(channel IN ('in_app','email','sms')), status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(job_id,user_id,channel)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ai_jobs','ai_preferences','ai_deliveries'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ai_read ON public.%I FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id() AND user_id=auth.uid())',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE INDEX ON public.%I(organization_id,user_id,created_at)',t);
  EXECUTE format('CREATE TRIGGER ai_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit()',t);
  EXECUTE format('CREATE TRIGGER ai_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record()',t);
 END LOOP;
END $$;
CREATE FUNCTION track_private.assert_ai_access() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; org uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role IN ('business_owner','admin') AND status='active') THEN RAISE EXCEPTION 'Owner or manager required'; END IF;
 v:=public.verify_business_subscription();org:=(v->>'organization_id')::uuid;
 IF NOT COALESCE((v->>'active')::boolean,false) OR NOT (
   COALESCE((v->>'trial_ends_at')::timestamptz>statement_timestamp(),false) OR
   COALESCE(v->>'plan_id' IN ('b3000000-0000-0000-0000-000000000003','b4000000-0000-0000-0000-000000000004','b5000000-0000-0000-0000-000000000005'),false)
 ) THEN RAISE EXCEPTION 'AI requires the introductory period or Growth and above'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION track_private.assert_ai_access() FROM PUBLIC;
CREATE FUNCTION public.reserve_ai_job(job_kind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result uuid; BEGIN
 org:=track_private.assert_ai_access();PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 IF (SELECT count(*) FROM public.ai_jobs WHERE user_id=auth.uid() AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'AI request limit reached. Try again later'; END IF;
 INSERT INTO public.ai_jobs(organization_id,user_id,kind) VALUES(org,auth.uid(),job_kind) RETURNING id INTO result;
 INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,reason) VALUES(org,auth.uid(),'AI_REQUEST','ai_jobs',result,'Trader requested assistance');
 RETURN result;
END $$;
CREATE FUNCTION public.finish_ai_job(job uuid, output jsonb, failed boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; BEGIN
 org:=track_private.assert_ai_access();
 UPDATE public.ai_jobs SET result=output,status=CASE WHEN failed THEN 'failed' ELSE 'ready' END WHERE id=job AND organization_id=org AND user_id=auth.uid() AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending AI request not found'; END IF;
 INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values) VALUES(org,auth.uid(),CASE WHEN failed THEN 'AI_FAILED' ELSE 'AI_SUGGESTION' END,'ai_jobs',job,output);
END $$;
CREATE FUNCTION public.approve_ai_job(job uuid, batch uuid DEFAULT null) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; j public.ai_jobs; BEGIN
 org:=track_private.assert_ai_access();
 SELECT * INTO j FROM public.ai_jobs WHERE id=job AND organization_id=org AND user_id=auth.uid() AND status='ready' FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Ready suggestion not found'; END IF;
 IF j.kind='inventory' AND batch IS NULL THEN RAISE EXCEPTION 'An import preview batch is required'; END IF;
 IF j.import_batch_id IS NOT NULL AND j.import_batch_id IS DISTINCT FROM batch THEN RAISE EXCEPTION 'Suggestion already approved for another batch'; END IF;
 UPDATE public.ai_jobs SET approved_at=now(),import_batch_id=batch WHERE id=job;
 INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values) VALUES(org,auth.uid(),'AI_APPROVAL','ai_jobs',job,jsonb_build_object('import_batch_id',batch));
END $$;
CREATE FUNCTION public.set_ai_preferences(in_app_enabled boolean,email_enabled boolean,sms_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; BEGIN
 org:=track_private.assert_ai_access();
 INSERT INTO public.ai_preferences(organization_id,user_id,in_app,email,sms) VALUES(org,auth.uid(),in_app_enabled,email_enabled,sms_enabled)
 ON CONFLICT(user_id) DO UPDATE SET in_app=excluded.in_app,email=excluded.email,sms=excluded.sms;
END $$;
CREATE FUNCTION public.reserve_ai_delivery(job uuid, delivery_channel text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; prefs public.ai_preferences; result uuid; BEGIN
 org:=track_private.assert_ai_access();PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||delivery_channel,2));
 IF NOT EXISTS(SELECT 1 FROM public.ai_jobs WHERE id=job AND organization_id=org AND user_id=auth.uid() AND approved_at IS NOT NULL AND kind='insights' AND status='ready') THEN RAISE EXCEPTION 'Approve the insight before delivery'; END IF;
 SELECT * INTO prefs FROM public.ai_preferences WHERE user_id=auth.uid();
 IF NOT COALESCE(CASE delivery_channel WHEN 'in_app' THEN prefs.in_app WHEN 'email' THEN prefs.email WHEN 'sms' THEN prefs.sms ELSE false END,false) THEN RAISE EXCEPTION 'Opt in to this delivery channel first'; END IF;
 IF (SELECT count(*) FROM public.ai_deliveries WHERE user_id=auth.uid() AND channel=delivery_channel AND created_at>now()-interval '1 hour')>=5 THEN RAISE EXCEPTION 'Channel delivery limit reached'; END IF;
 INSERT INTO public.ai_deliveries(organization_id,user_id,job_id,channel) VALUES(org,auth.uid(),job,delivery_channel) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.complete_ai_delivery(delivery uuid, succeeded boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; d public.ai_deliveries; j public.ai_jobs; BEGIN
 org:=track_private.assert_ai_access();
 UPDATE public.ai_deliveries SET status=CASE WHEN succeeded THEN 'sent' ELSE 'failed' END WHERE id=delivery AND user_id=auth.uid() AND organization_id=org AND status='reserved' RETURNING * INTO d;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Reserved delivery not found'; END IF;
 IF succeeded AND d.channel='in_app' THEN
  SELECT * INTO j FROM public.ai_jobs WHERE id=d.job_id;
  INSERT INTO public.notifications(organization_id,user_id,type,title,message,data) VALUES(org,auth.uid(),'ai_insight','TracKasuwa insights (stub)',COALESCE(j.result->>'summary','Organization-only insights are ready'),jsonb_build_object('job_id',j.id,'stub',true));
 END IF;
 INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values) VALUES(org,auth.uid(),CASE WHEN succeeded THEN 'AI_EXECUTED' ELSE 'AI_DELIVERY_FAILED' END,'ai_deliveries',delivery,jsonb_build_object('channel',d.channel));
END $$;
CREATE FUNCTION track_private.audit_ai_import() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job uuid; BEGIN
 SELECT id INTO job FROM public.ai_jobs WHERE organization_id=NEW.organization_id AND import_batch_id=NEW.import_batch_id AND approved_at IS NOT NULL LIMIT 1;
 IF job IS NOT NULL THEN
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values,correlation_id) VALUES(NEW.organization_id,auth.uid(),'AI_EXECUTED',NEW.target_type,NEW.entity_id,jsonb_build_object('job_id',job,'outcome',NEW.outcome,'row',NEW.row_number),NEW.import_batch_id);
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.audit_ai_import() FROM PUBLIC;
CREATE TRIGGER ai_import_execution AFTER INSERT ON public.import_rows FOR EACH ROW EXECUTE FUNCTION track_private.audit_ai_import();
REVOKE ALL ON FUNCTION public.reserve_ai_job(text),public.finish_ai_job(uuid,jsonb,boolean),public.approve_ai_job(uuid,uuid),public.set_ai_preferences(boolean,boolean,boolean),public.reserve_ai_delivery(uuid,text),public.complete_ai_delivery(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_job(text),public.finish_ai_job(uuid,jsonb,boolean),public.approve_ai_job(uuid,uuid),public.set_ai_preferences(boolean,boolean,boolean),public.reserve_ai_delivery(uuid,text),public.complete_ai_delivery(uuid,boolean) TO authenticated;

-- Source: 017_invoice_number_immutability.sql

-- Number allocation and legacy backfill happened in 014. Once assigned,
-- official numbers must never be changed through an UPDATE, even by an owner.
CREATE FUNCTION track_private.protect_invoice_number() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.official_invoice_number IS DISTINCT FROM OLD.official_invoice_number THEN
  RAISE EXCEPTION 'Official invoice numbers are immutable';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.protect_invoice_number() FROM PUBLIC;
CREATE TRIGGER protect_official_invoice_number BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION track_private.protect_invoice_number();

-- New accounts must reach payment-confirmed activation. The legacy signup
-- handler's unconfirmed trial must not grant transaction/AI entitlement.
CREATE OR REPLACE FUNCTION public.verify_business_subscription() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org public.organizations; sub public.subscriptions; active boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT o.* INTO org FROM public.organizations o JOIN public.users u ON u.organization_id=o.id WHERE u.id=auth.uid() AND u.status='active';
 IF org.id IS NULL THEN RAISE EXCEPTION 'Business membership required'; END IF;
 SELECT * INTO sub FROM public.subscriptions WHERE organization_id=org.id ORDER BY created_at DESC,id DESC LIMIT 1;
 active:=COALESCE(sub.status IN ('active','trial') AND
   (NOT org.intro_eligible OR org.trial_started_at IS NOT NULL) AND
   (sub.expires_at>statement_timestamp() OR org.trial_ends_at>statement_timestamp()),false);
 RETURN jsonb_build_object('organization_id',org.id,'active',active,'server_time',statement_timestamp(),'trial_ends_at',org.trial_ends_at,'subscription_period_start',org.subscription_period_start,'plan_id',sub.plan_id);
END $$;

-- Old clients have no sale FK on stock changes. Do not guess when their
-- device timestamps collide; require reconciliation instead of double stock.
CREATE FUNCTION track_private.guard_reversal_stock_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sold_at timestamptz;
BEGIN
 IF NEW.kind IN ('void','refund','return') THEN
  SELECT created_at INTO sold_at FROM public.sales WHERE id=NEW.sale_id;
  IF (SELECT count(*) FROM public.sales WHERE organization_id=NEW.organization_id AND created_at=sold_at)>1 THEN
   RAISE EXCEPTION 'Ambiguous stock link; reconcile this sale before reversal';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_reversal_stock_link() FROM PUBLIC;
CREATE TRIGGER protect_reversal_stock_link BEFORE INSERT ON public.financial_reversals FOR EACH ROW EXECUTE FUNCTION track_private.guard_reversal_stock_link();

SELECT jsonb_build_object('sales',(SELECT count(*) FROM public.sales),'numbered_sales',(SELECT count(*) FROM public.sales WHERE official_invoice_number IS NOT NULL),'audit_rows',(SELECT count(*) FROM public.audit_logs),'chained_rows',(SELECT count(*) FROM public.audit_logs WHERE row_hash IS NOT NULL),'new_tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('accounting_counters','financial_reversals','cash_up_closes','import_batches','import_rows','import_reversals','historical_sales','staff_invites','ai_jobs','ai_preferences','ai_deliveries')),'new_tables_without_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('accounting_counters','financial_reversals','cash_up_closes','import_batches','import_rows','import_reversals','historical_sales','staff_invites','ai_jobs','ai_preferences','ai_deliveries') AND NOT c.relrowsecurity),'digest_works',length(encode(public.digest('abc'::bytea,'sha256'),'hex'))=64) AS migration_check;
DO $verify$ BEGIN
 IF (SELECT sales_hash FROM deployment_baseline) IS DISTINCT FROM (SELECT md5(COALESCE(string_agg((to_jsonb(s)-ARRAY['official_invoice_number','updated_at','original_device_timestamp'])::text,'' ORDER BY s.id),'')) FROM public.sales s) THEN RAISE EXCEPTION 'Original sale data changed'; END IF;
 IF (SELECT inventory_hash FROM deployment_baseline) IS DISTINCT FROM (SELECT md5(COALESCE(string_agg((to_jsonb(i)-ARRAY['original_device_timestamp','import_batch_id'])::text,'' ORDER BY i.id),'')) FROM public.inventory i) THEN RAISE EXCEPTION 'Inventory data changed'; END IF;
END $verify$;
COMMIT;
