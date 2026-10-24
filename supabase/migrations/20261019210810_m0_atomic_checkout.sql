BEGIN;

-- Private replay evidence; neither clients nor the Data API can manufacture it.
CREATE TABLE track_private.pos_checkout_commits (
 sale_id uuid PRIMARY KEY REFERENCES public.sales(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 actor_id uuid NOT NULL REFERENCES public.users(id),
 payload_hash text NOT NULL,
 result jsonb NOT NULL,
 recovery_reason text,
 committed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE track_private.pos_checkout_commits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON track_private.pos_checkout_commits FROM PUBLIC,anon,authenticated;
CREATE TABLE track_private.stock_command_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false
);
INSERT INTO track_private.stock_command_settings DEFAULT VALUES;
ALTER TABLE track_private.stock_command_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON track_private.stock_command_settings FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.post_pos_checkout(command jsonb, reconcile_legacy boolean DEFAULT false, recovery_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; s public.sales; old_sale public.sales; item public.sale_items;
 line jsonb; position record; stock public.inventory; saved track_private.pos_checkout_commits;
 fingerprint text; computed_subtotal numeric:=0; existing_effect numeric; stocks jsonb:='[]'; result jsonb;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active' FOR SHARE;
 IF actor.id IS NULL OR actor.organization_id IS NULL OR actor.role NOT IN ('business_owner','admin','cashier') THEN
  RAISE EXCEPTION 'Active business user required';
 END IF;
 IF jsonb_typeof(command) IS DISTINCT FROM 'object' OR jsonb_typeof(command->'sale') IS DISTINCT FROM 'object'
  OR jsonb_typeof(command->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid checkout command'; END IF;
 IF jsonb_array_length(command->'items') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Checkout requires 1 to 1000 lines'; END IF;
 s:=jsonb_populate_record(NULL::public.sales,command->'sale');
 IF s.id IS NULL OR s.organization_id IS DISTINCT FROM actor.organization_id OR s.warehouse_id IS NULL
  OR s.created_at IS NULL OR s.invoice_number IS NULL OR s.status IS DISTINCT FROM 'completed' THEN
  RAISE EXCEPTION 'Invalid sale identity or business';
 END IF;
 IF s.cashier_id IS DISTINCT FROM actor.id AND (NOT reconcile_legacy OR actor.role NOT IN ('business_owner','admin')) THEN
  RAISE EXCEPTION 'Checkout must belong to the signed-in cashier';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=s.cashier_id AND organization_id=actor.organization_id)
  OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=s.warehouse_id AND organization_id=actor.organization_id) THEN
  RAISE EXCEPTION 'Invalid cashier or location';
 END IF;
 PERFORM track_private.assert_active_transaction_access(actor.organization_id);
 fingerprint:=encode(public.digest(command::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(s.id::text,1700));
 SELECT * INTO saved FROM track_private.pos_checkout_commits WHERE sale_id=s.id;
 IF FOUND THEN
  IF saved.organization_id<>actor.organization_id OR saved.payload_hash<>fingerprint THEN RAISE EXCEPTION 'Checkout payload differs from committed command'; END IF;
  RETURN saved.result;
 END IF;
 IF NOT (SELECT enabled FROM track_private.stock_command_settings WHERE singleton) THEN RAISE EXCEPTION 'Atomic stock commands are disabled'; END IF;
 -- The legacy reversal contract links stock by organization + sale timestamp.
 -- Serialize collisions and reject them atomically, never attach another sale's ledger.
 PERFORM pg_advisory_xact_lock(hashtextextended(s.organization_id::text||s.created_at::text,1701));
 IF EXISTS(SELECT 1 FROM public.sales WHERE organization_id=s.organization_id AND created_at=s.created_at AND id<>s.id) THEN
  RAISE EXCEPTION 'Ambiguous sale timestamp requires review';
 END IF;
 SELECT * INTO old_sale FROM public.sales WHERE id=s.id FOR UPDATE;
 IF old_sale.id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.financial_reversals WHERE sale_id=s.id AND kind IN ('void','refund','return')) THEN
   RAISE EXCEPTION 'Reversed receipt requires owner review; no missing effects were posted';
  END IF;
  IF NOT reconcile_legacy OR length(trim(COALESCE(recovery_reason,'')))<8 THEN RAISE EXCEPTION 'Existing sale requires explicit reconciliation and reason'; END IF;
  IF old_sale.organization_id<>s.organization_id OR old_sale.created_at IS DISTINCT FROM s.created_at OR
   (to_jsonb(old_sale) - ARRAY['updated_at','official_invoice_number','created_at']) @> ((command->'sale')-'created_at') IS NOT TRUE THEN
   RAISE EXCEPTION 'Existing sale differs from saved receipt';
  END IF;
 ELSIF reconcile_legacy AND s.cashier_id<>actor.id THEN RAISE EXCEPTION 'Cannot create another cashier sale during recovery';
 END IF;
 IF s.subtotal IS NULL OR s.discount IS NULL OR s.tax IS NULL OR s.total IS NULL OR s.amount_paid IS NULL OR s.change_amount IS NULL
  OR LEAST(s.subtotal,s.discount,s.tax,s.total,s.amount_paid,s.change_amount)<0 OR s.discount>s.subtotal
  OR GREATEST(s.subtotal,s.discount,s.tax,s.total,s.amount_paid,s.change_amount)>9999999999.99
  OR s.total<>s.subtotal-s.discount+s.tax OR s.change_amount<>greatest(s.amount_paid-s.total,0)
  OR s.payment_method NOT IN ('cash','transfer','pos_terminal','partial','split') THEN RAISE EXCEPTION 'Invalid checkout amounts'; END IF;
 IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(command->'items') v)<>jsonb_array_length(command->'items') THEN
  RAISE EXCEPTION 'Duplicate or missing checkout line identity';
 END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(command->'items') LOOP
  item:=jsonb_populate_record(NULL::public.sale_items,line);
  IF item.id IS NULL OR item.sale_id IS DISTINCT FROM s.id OR item.warehouse_id IS DISTINCT FROM s.warehouse_id
   OR item.quantity IS NULL OR item.quantity<=0 OR item.unit_price IS NULL OR item.cost_price IS NULL OR item.discount IS NULL
   OR LEAST(item.unit_price,item.cost_price,item.discount)<0 OR item.discount>100
   OR GREATEST(item.unit_price,item.cost_price,item.total)>9999999999.99
   OR item.total IS DISTINCT FROM round(item.quantity*item.unit_price*(1-item.discount/100),2) THEN RAISE EXCEPTION 'Invalid checkout line'; END IF;
  PERFORM 1 FROM public.products WHERE id=item.product_id AND organization_id=s.organization_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product is unavailable in this business'; END IF;
  IF actor.role='cashier' AND (item.discount<>0 OR item.unit_price<>(SELECT selling_price FROM public.products WHERE id=item.product_id)) THEN
   RAISE EXCEPTION 'Manager approval is required for price changes'; END IF;
  computed_subtotal:=computed_subtotal+item.total;
  IF EXISTS(SELECT 1 FROM public.sale_items i WHERE id=item.id AND
    (i.sale_id<>s.id OR NOT to_jsonb(i) @> line)) THEN RAISE EXCEPTION 'Existing line differs from saved receipt'; END IF;
 END LOOP;
 IF computed_subtotal<>s.subtotal THEN RAISE EXCEPTION 'Checkout subtotal does not match lines'; END IF;
 IF EXISTS(SELECT 1 FROM public.sale_items i WHERE sale_id=s.id AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(command->'items') v WHERE (v->>'id')::uuid=i.id)) THEN RAISE EXCEPTION 'Saved receipt is missing server lines'; END IF;
 -- Lock every stock position in the same order before applying any effect.
 FOR position IN SELECT (v->>'product_id')::uuid product_id,sum((v->>'quantity')::integer)::integer quantity
  FROM jsonb_array_elements(command->'items') v GROUP BY 1 ORDER BY 1 LOOP
  SELECT * INTO stock FROM public.inventory WHERE organization_id=s.organization_id AND product_id=position.product_id AND warehouse_id=s.warehouse_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory missing at selected location'; END IF;
 END LOOP;
 IF old_sale.id IS NULL THEN
  INSERT INTO public.sales(id,organization_id,invoice_number,cashier_id,warehouse_id,customer_name,customer_phone,
   subtotal,discount,tax,total,amount_paid,change_amount,payment_method,payment_status,status,notes,receipt_url,created_at,original_device_timestamp)
  VALUES(s.id,s.organization_id,s.invoice_number,s.cashier_id,s.warehouse_id,s.customer_name,s.customer_phone,
   s.subtotal,s.discount,s.tax,s.total,s.amount_paid,s.change_amount,s.payment_method,
   CASE WHEN s.amount_paid>=s.total THEN 'paid' WHEN s.amount_paid=0 THEN 'unpaid' ELSE 'partial' END,'completed',s.notes,s.receipt_url,s.created_at,s.created_at);
 END IF;
 INSERT INTO public.sale_items(id,sale_id,product_id,warehouse_id,quantity,unit_price,cost_price,discount,total,created_at,original_device_timestamp)
 SELECT (v->>'id')::uuid,s.id,(v->>'product_id')::uuid,s.warehouse_id,(v->>'quantity')::integer,(v->>'unit_price')::numeric,
  (v->>'cost_price')::numeric,(v->>'discount')::numeric,(v->>'total')::numeric,s.created_at,s.created_at
 FROM jsonb_array_elements(command->'items') v ON CONFLICT(id) DO NOTHING;
 FOR position IN SELECT (v->>'product_id')::uuid product_id,sum((v->>'quantity')::integer)::integer quantity
  FROM jsonb_array_elements(command->'items') v GROUP BY 1 ORDER BY 1 LOOP
  SELECT * INTO stock FROM public.inventory WHERE organization_id=s.organization_id AND product_id=position.product_id AND warehouse_id=s.warehouse_id;
  SELECT COALESCE(sum(quantity),0) INTO existing_effect FROM public.inventory_movements WHERE organization_id=s.organization_id
   AND product_id=position.product_id AND warehouse_id=s.warehouse_id AND reference_type='inventory_ledger' AND original_device_timestamp=s.created_at;
  IF existing_effect<>0 AND (NOT reconcile_legacy OR existing_effect<>-position.quantity) THEN RAISE EXCEPTION 'Ambiguous stock history requires review'; END IF;
  IF existing_effect=0 THEN
   IF stock.quantity<position.quantity THEN RAISE EXCEPTION 'Insufficient stock at selected location'; END IF;
   UPDATE public.inventory SET quantity=quantity-position.quantity,original_device_timestamp=s.created_at WHERE id=stock.id RETURNING * INTO stock;
  END IF;
  stocks:=stocks||jsonb_build_array(jsonb_build_object('id',stock.id,'quantity',stock.quantity,'updated_at',stock.updated_at));
 END LOOP;
 SELECT jsonb_build_object('sale_id',id,'official_invoice_number',official_invoice_number,'stocks',stocks) INTO result FROM public.sales WHERE id=s.id;
 INSERT INTO track_private.pos_checkout_commits(sale_id,organization_id,actor_id,payload_hash,result,recovery_reason)
 VALUES(s.id,s.organization_id,actor.id,fingerprint,result,CASE WHEN reconcile_legacy THEN recovery_reason ELSE NULL END);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.post_pos_checkout(jsonb,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_pos_checkout(jsonb,boolean,text) TO authenticated;

-- Legacy views must apply underlying RLS. Remove permissive policies that
-- otherwise OR away the intended audit/platform access boundaries.
ALTER VIEW public.v_merchant_summary SET (security_invoker=true);
ALTER VIEW public.v_subscription_revenue SET (security_invoker=true);
DROP POLICY IF EXISTS audit_logs_select_own_org ON public.audit_logs;
DROP POLICY IF EXISTS audit_insert_all ON public.audit_logs;
REVOKE INSERT,UPDATE,DELETE ON public.audit_logs FROM authenticated,anon;
ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offline_sync_queue FROM authenticated,anon;
DROP POLICY IF EXISTS invoices_insert_service ON public.invoices;
DROP POLICY IF EXISTS invoices_update_service ON public.invoices;
DROP POLICY IF EXISTS invoices_update_admin ON public.invoices;
DROP POLICY IF EXISTS webhook_logs_insert_service ON public.webhook_logs;
DROP POLICY IF EXISTS webhook_logs_update_service ON public.webhook_logs;
REVOKE INSERT,UPDATE,DELETE ON public.invoices,public.webhook_logs FROM authenticated,anon;

CREATE TABLE track_private.inventory_adjustment_commits (
 command_id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 payload_hash text NOT NULL, result jsonb NOT NULL, actor_id uuid NOT NULL REFERENCES public.users(id),
 committed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE track_private.inventory_adjustment_commits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON track_private.inventory_adjustment_commits FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.apply_inventory_adjustment(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; stock public.inventory; saved track_private.inventory_adjustment_commits;
 adjustment_id uuid:=(command->>'id')::uuid; business uuid:=(command->>'organization_id')::uuid;
 product uuid:=(command->>'product_id')::uuid; location uuid:=(command->>'warehouse_id')::uuid;
 delta integer:=(command->>'quantity_change')::integer; fingerprint text; result jsonb;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active' FOR SHARE;
 IF actor.id IS NULL OR actor.role NOT IN ('business_owner','admin') OR actor.organization_id IS DISTINCT FROM business
  OR actor.id IS DISTINCT FROM (command->>'user_id')::uuid THEN RAISE EXCEPTION 'Active stock manager required'; END IF;
 IF adjustment_id IS NULL OR delta IS NULL OR delta=0 OR length(trim(COALESCE(command->>'reason','')))<3
  OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=product AND organization_id=business)
  OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=location AND organization_id=business) THEN RAISE EXCEPTION 'Valid stock position, integer change and reason required'; END IF;
 PERFORM track_private.assert_active_transaction_access(business);
 fingerprint:=encode(public.digest(command::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(adjustment_id::text,1702));
 SELECT * INTO saved FROM track_private.inventory_adjustment_commits c WHERE c.command_id=adjustment_id;
 IF FOUND THEN
  IF saved.organization_id<>business OR saved.payload_hash<>fingerprint THEN RAISE EXCEPTION 'Adjustment payload differs from committed command'; END IF;
  RETURN saved.result;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(business::text||product::text||location::text,1703));
 SELECT * INTO stock FROM public.inventory WHERE organization_id=business AND product_id=product AND warehouse_id=location FOR UPDATE;
 IF COALESCE(stock.quantity,0)::bigint+delta NOT BETWEEN 0 AND 2147483647 THEN RAISE EXCEPTION 'Invalid or insufficient stock'; END IF;
 PERFORM set_config('track.reason',command->>'reason',true);
 IF stock.id IS NULL THEN
  INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity,min_stock_level)
   VALUES(business,product,location,delta,5) RETURNING * INTO stock;
 ELSE
  UPDATE public.inventory SET quantity=quantity+delta,original_device_timestamp=NULL WHERE id=stock.id RETURNING * INTO stock;
 END IF;
 result:=jsonb_build_object('id',stock.id,'organization_id',business,'product_id',product,'warehouse_id',location,
  'quantity',stock.quantity,'updated_at',stock.updated_at,'min_stock_level',stock.min_stock_level);
 INSERT INTO track_private.inventory_adjustment_commits(command_id,organization_id,payload_hash,result,actor_id)
  VALUES(adjustment_id,business,fingerprint,result,actor.id);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_inventory_adjustment(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_inventory_adjustment(jsonb) TO authenticated;

-- Restrictive policies combine with every existing permissive policy using
-- AND, so an older org-wide SELECT cannot restore suspended-account access.
CREATE FUNCTION public.has_active_account() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND status='active')
$$;
REVOKE ALL ON FUNCTION public.has_active_account() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_active_account() TO authenticated;
DO $$ DECLARE target record;
BEGIN
 FOR target IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity LOOP
  EXECUTE format('CREATE POLICY m0_active_account ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.has_active_account())) WITH CHECK ((SELECT public.has_active_account()))',target.relname);
 END LOOP;
END $$;
COMMIT;
