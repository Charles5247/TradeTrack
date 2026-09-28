-- TracKasuwa accounting controls. Existing records remain intact.
BEGIN;
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
COMMIT;
