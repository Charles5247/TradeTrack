-- Additive medical stock foundation. No existing product is enrolled automatically.
-- Tables are read-only to clients; writes require authenticated, scoped RPCs.
ALTER TABLE public.products ADD COLUMN medical_stock_managed boolean NOT NULL DEFAULT false;
CREATE TABLE public.medical_products (
  product_id uuid PRIMARY KEY REFERENCES public.products(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  base_unit text NOT NULL CHECK(length(trim(base_unit)) BETWEEN 1 AND 40),
  units_per_pack integer NOT NULL CHECK(units_per_pack BETWEEN 1 AND 100000),
  classification text NOT NULL CHECK(classification IN ('general','prescription','controlled')),
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,product_id)
);
CREATE TABLE public.medical_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  batch_number text NOT NULL CHECK(length(trim(batch_number)) BETWEEN 1 AND 100),
  expires_on date NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK(quantity>=0),
  status text NOT NULL CHECK(status IN ('available','quarantined','recalled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,product_id) REFERENCES public.medical_products(organization_id,product_id),
  UNIQUE(organization_id,product_id,warehouse_id,batch_number),
  UNIQUE(organization_id,id)
);
CREATE INDEX medical_batch_fefo ON public.medical_batches(organization_id,product_id,warehouse_id,expires_on,id) WHERE status='available' AND quantity>0;
CREATE TABLE public.medical_stock_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  batch_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('receive','sale','free_issue','quarantine','recall','release')),
  quantity integer NOT NULL,
  source_reference text NOT NULL CHECK(length(trim(source_reference)) BETWEEN 3 AND 200),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
  request jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,batch_id) REFERENCES public.medical_batches(organization_id,id)
);
CREATE INDEX medical_event_org_time ON public.medical_stock_events(organization_id,created_at DESC);
CREATE INDEX medical_event_batch ON public.medical_stock_events(batch_id);
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['medical_products','medical_batches','medical_stock_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY medical_org_read ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.status=''active'' AND u.organization_id=%I.organization_id))',t,t);
  END LOOP;
END $$;
CREATE TRIGGER medical_event_immutable BEFORE UPDATE OR DELETE ON public.medical_stock_events
FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();

CREATE FUNCTION track_private.medical_manager() RETURNS public.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active' AND role IN ('business_owner','admin');
 IF actor.id IS NULL OR actor.organization_id IS NULL THEN RAISE EXCEPTION 'Active business owner or admin required'; END IF;
 PERFORM track_private.assert_active_transaction_access(actor.organization_id);
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION track_private.medical_manager() FROM PUBLIC;

CREATE FUNCTION public.register_medical_product(target_product uuid, base_unit text, units_per_pack integer, classification text)
RETURNS public.medical_products LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; result public.medical_products;
BEGIN
 actor:=track_private.medical_manager();
 PERFORM 1 FROM public.products WHERE id=target_product AND organization_id=actor.organization_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active product not found in this business'; END IF;
 -- Existing quantities require a reconciled opening-balance migration, not silent reclassification.
 IF EXISTS(SELECT 1 FROM public.inventory WHERE product_id=target_product AND quantity<>0) THEN
   RAISE EXCEPTION 'Reconcile existing stock before enrolling batch inventory';
 END IF;
 INSERT INTO public.medical_products(product_id,organization_id,base_unit,units_per_pack,classification,created_by)
 VALUES(target_product,actor.organization_id,trim(base_unit),units_per_pack,classification,actor.id)
 RETURNING * INTO result;
 UPDATE public.products SET medical_stock_managed=true WHERE id=target_product;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.register_medical_product(uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_medical_product(uuid,text,integer,text) TO authenticated;

CREATE FUNCTION public.receive_medical_batch(request_id uuid, target_product uuid, target_warehouse uuid,
 lot_number text, expiry_date date, received_units integer, source_reference text, reason text)
RETURNS public.medical_stock_events LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; existing public.medical_stock_events; batch public.medical_batches; request_body jsonb; today date;
BEGIN
 actor:=track_private.medical_manager();
 IF request_id IS NULL OR received_units IS NULL OR received_units<=0 OR expiry_date IS NULL
 OR lot_number IS NULL OR length(trim(lot_number)) NOT BETWEEN 1 AND 100
 OR source_reference IS NULL OR length(trim(source_reference)) NOT BETWEEN 3 AND 200
 OR reason IS NULL OR length(trim(reason)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Complete, valid batch receipt details are required'; END IF;
 request_body:=jsonb_build_object('product',target_product,'warehouse',target_warehouse,'lot',trim(lot_number),
  'expiry',expiry_date,'quantity',received_units,'source',trim(source_reference),'reason',trim(reason));
 -- Serialize retries even before the receipt exists; same key with changed data is rejected.
 PERFORM pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 SELECT * INTO existing FROM public.medical_stock_events WHERE id=request_id;
 IF FOUND THEN
  IF existing.organization_id<>actor.organization_id OR existing.created_by<>actor.id OR existing.request<>request_body THEN
   RAISE EXCEPTION 'Receipt id already used for a different request';
  END IF;
  RETURN existing;
 END IF;
 PERFORM 1 FROM public.medical_products m JOIN public.products p ON p.id=m.product_id
 WHERE m.product_id=target_product AND m.organization_id=actor.organization_id AND p.status='active' FOR UPDATE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch-managed product not found'; END IF;
 PERFORM 1 FROM public.warehouses WHERE id=target_warehouse AND organization_id=actor.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Storage location not found in this business'; END IF;
 today:=(statement_timestamp() AT TIME ZONE 'Africa/Lagos')::date;
 INSERT INTO public.medical_batches(organization_id,product_id,warehouse_id,batch_number,expires_on,status)
 VALUES(actor.organization_id,target_product,target_warehouse,trim(lot_number),expiry_date,
  CASE WHEN expiry_date<today THEN 'quarantined' ELSE 'available' END)
 ON CONFLICT(organization_id,product_id,warehouse_id,batch_number) DO NOTHING;
 SELECT * INTO batch FROM public.medical_batches WHERE organization_id=actor.organization_id AND product_id=target_product
 AND warehouse_id=target_warehouse AND batch_number=trim(lot_number) FOR UPDATE;
 IF batch.expires_on<>expiry_date THEN RAISE EXCEPTION 'Batch expiry conflicts with the recorded expiry'; END IF;
 IF batch.status='recalled' THEN RAISE EXCEPTION 'Recalled stock cannot be received as usable inventory'; END IF;
 UPDATE public.medical_batches SET quantity=quantity+received_units,updated_at=now(),
 status=CASE WHEN expires_on<today THEN 'quarantined' ELSE status END WHERE id=batch.id;
 INSERT INTO public.medical_stock_events(id,organization_id,batch_id,kind,quantity,source_reference,reason,request,created_by)
 VALUES(request_id,actor.organization_id,batch.id,'receive',received_units,trim(source_reference),trim(reason),request_body,actor.id)
 RETURNING * INTO existing;
 RETURN existing;
END $$;
REVOKE ALL ON FUNCTION public.receive_medical_batch(uuid,uuid,uuid,text,date,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_medical_batch(uuid,uuid,uuid,text,date,integer,text,text) TO authenticated;

-- Legacy clients must never bypass batch controls by writing aggregate stock.
CREATE FUNCTION track_private.guard_medical_legacy_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE product uuid;
BEGIN
 IF TG_OP='DELETE' THEN product:=OLD.product_id; ELSE product:=NEW.product_id; END IF;
 IF EXISTS(SELECT 1 FROM public.medical_products WHERE product_id=product) THEN
  RAISE EXCEPTION 'Use the medical batch workflow for this product';
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.medical_products WHERE product_id=OLD.product_id) THEN
  RAISE EXCEPTION 'Use the medical batch workflow for this product';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_medical_legacy_write() FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['inventory','sale_items','warehouse_transfers','vendor_transaction_items','purchase_order_items'] LOOP
  EXECUTE format('CREATE TRIGGER medical_legacy_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.guard_medical_legacy_write()',t);
 END LOOP;
END $$;
CREATE FUNCTION track_private.guard_medical_product_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.medical_stock_managed IS DISTINCT FROM EXISTS(SELECT 1 FROM public.medical_products WHERE product_id=NEW.id) THEN
  RAISE EXCEPTION 'Batch tracking is managed through product enrollment';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_medical_product_flag() FROM PUBLIC;
CREATE TRIGGER medical_product_flag BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION track_private.guard_medical_product_flag();

CREATE TABLE public.medical_issues (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 product_id uuid NOT NULL REFERENCES public.medical_products(product_id),
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
 kind text NOT NULL CHECK(kind IN ('sale','free_issue')),
 quantity integer NOT NULL CHECK(quantity>0),
 unit_price numeric(12,2) NOT NULL CHECK(unit_price>=0),
 total numeric(12,2) NOT NULL CHECK(total>=0),
 recipient_reference text NOT NULL CHECK(length(trim(recipient_reference)) BETWEEN 3 AND 200),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 1000),
 sale_item_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 allocations jsonb NOT NULL,
 request jsonb NOT NULL,
 created_by uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'free_issue' OR (total=0 AND unit_price=0))
);
CREATE INDEX medical_issue_org_time ON public.medical_issues(organization_id,created_at DESC);
ALTER TABLE public.medical_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.medical_issues FROM anon,authenticated;
GRANT SELECT ON public.medical_issues TO authenticated;
CREATE POLICY medical_issue_read ON public.medical_issues FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.users u WHERE u.id=auth.uid() AND u.status='active' AND u.organization_id=medical_issues.organization_id));
CREATE TRIGGER medical_issue_immutable BEFORE UPDATE OR DELETE ON public.medical_issues
FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();

CREATE OR REPLACE FUNCTION track_private.guard_medical_legacy_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE product uuid;
BEGIN
 IF TG_OP='DELETE' THEN product:=OLD.product_id; ELSE product:=NEW.product_id; END IF;
 IF TG_TABLE_NAME='sale_items' AND TG_OP='INSERT' THEN
  -- Only the exact financial line authorized inside the atomic batch RPC.
  IF EXISTS(SELECT 1 FROM public.medical_issues i WHERE i.id=NEW.sale_id AND i.sale_item_id=NEW.id
   AND i.kind='sale' AND i.created_by=auth.uid() AND i.product_id=NEW.product_id
   AND i.warehouse_id=NEW.warehouse_id AND i.quantity=NEW.quantity AND i.unit_price=NEW.unit_price
   AND i.total=NEW.total AND NEW.discount=0) THEN RETURN NEW; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.medical_products WHERE product_id=product) THEN
  RAISE EXCEPTION 'Use the medical batch workflow for this product';
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.medical_products WHERE product_id=OLD.product_id) THEN
  RAISE EXCEPTION 'Use the medical batch workflow for this product';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.issue_medical_stock(request_id uuid,target_product uuid,target_warehouse uuid,
 issued_units integer,issue_kind text,recipient_reference text,reason text,expected_unit_price numeric,payment_method text)
RETURNS public.medical_issues LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; profile public.medical_products; product public.products;
 result public.medical_issues; batch public.medical_batches; body jsonb; today date;
 remaining integer; taken integer; allocations jsonb:='[]'; unit_price numeric(12,2); amount numeric(12,2); item jsonb;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active' AND role IN ('business_owner','admin','cashier');
 IF actor.id IS NULL OR actor.organization_id IS NULL THEN RAISE EXCEPTION 'Active business user required'; END IF;
 PERFORM track_private.assert_active_transaction_access(actor.organization_id);
 IF request_id IS NULL OR issued_units IS NULL OR issued_units<=0 OR issue_kind IS NULL OR issue_kind NOT IN ('sale','free_issue')
 OR recipient_reference IS NULL OR length(trim(recipient_reference)) NOT BETWEEN 3 AND 200
 OR reason IS NULL OR length(trim(reason)) NOT BETWEEN 3 AND 1000 OR expected_unit_price IS NULL OR expected_unit_price<0
 OR payment_method IS NULL OR payment_method NOT IN ('cash','transfer','pos_terminal') THEN RAISE EXCEPTION 'Complete valid issue details are required'; END IF;
 IF issue_kind='free_issue' AND actor.role='cashier' THEN RAISE EXCEPTION 'Manager approval required for free issues'; END IF;
 body:=jsonb_build_object('product',target_product,'warehouse',target_warehouse,'quantity',issued_units,'kind',issue_kind,
 'recipient',trim(recipient_reference),'reason',trim(reason),'price',expected_unit_price,'payment',payment_method);
 PERFORM pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 SELECT * INTO result FROM public.medical_issues WHERE id=request_id;
 IF FOUND THEN
  IF result.organization_id<>actor.organization_id OR result.created_by<>actor.id OR result.request<>body THEN
   RAISE EXCEPTION 'Issue id already used for a different request';
  END IF;
  RETURN result;
 END IF;
 SELECT * INTO profile FROM public.medical_products WHERE product_id=target_product AND organization_id=actor.organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch-managed product not found'; END IF;
 -- Clinical approvals are a separate release gate; never treat these as ordinary stock.
 IF profile.classification<>'general' THEN RAISE EXCEPTION 'Prescription and controlled dispensing are not enabled'; END IF;
 SELECT * INTO product FROM public.products WHERE id=target_product AND organization_id=actor.organization_id AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'Active product not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=target_warehouse AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Storage location not found'; END IF;
 unit_price:=CASE WHEN issue_kind='sale' THEN product.selling_price ELSE 0 END;
 IF expected_unit_price<>unit_price THEN RAISE EXCEPTION 'Price changed; review the current unit price'; END IF;
 amount:=unit_price*issued_units;
 remaining:=issued_units;
 today:=(statement_timestamp() AT TIME ZONE 'Africa/Lagos')::date;
 FOR batch IN SELECT * FROM public.medical_batches WHERE organization_id=actor.organization_id AND product_id=target_product
  AND warehouse_id=target_warehouse AND status='available' AND expires_on>=today AND quantity>0 ORDER BY expires_on,id FOR UPDATE LOOP
  EXIT WHEN remaining=0;
  taken:=least(remaining,batch.quantity);
  UPDATE public.medical_batches SET quantity=quantity-taken,updated_at=now() WHERE id=batch.id;
  allocations:=allocations||jsonb_build_array(jsonb_build_object('batch_id',batch.id,'batch_number',batch.batch_number,'expires_on',batch.expires_on,'quantity',taken));
  remaining:=remaining-taken;
 END LOOP;
 IF remaining<>0 THEN RAISE EXCEPTION 'Insufficient unexpired, available batch stock'; END IF;
 INSERT INTO public.medical_issues(id,organization_id,product_id,warehouse_id,kind,quantity,unit_price,total,
  recipient_reference,reason,allocations,request,created_by)
 VALUES(request_id,actor.organization_id,target_product,target_warehouse,issue_kind,issued_units,unit_price,amount,
  trim(recipient_reference),trim(reason),allocations,body,actor.id) RETURNING * INTO result;
 IF issue_kind='sale' THEN
  INSERT INTO public.sales(id,organization_id,invoice_number,cashier_id,warehouse_id,subtotal,discount,tax,total,
   amount_paid,change_amount,payment_method,payment_status,status,notes)
  VALUES(request_id,actor.organization_id,'MED-'||request_id::text,actor.id,target_warehouse,amount,0,0,amount,
   amount,0,payment_method,'paid','completed','Medical batch sale');
  INSERT INTO public.sale_items(id,sale_id,product_id,warehouse_id,quantity,unit_price,cost_price,discount,total)
  VALUES(result.sale_item_id,request_id,target_product,target_warehouse,issued_units,unit_price,product.cost_price,0,amount);
 END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(allocations) LOOP
  INSERT INTO public.medical_stock_events(id,organization_id,batch_id,kind,quantity,source_reference,reason,request,created_by)
  VALUES(gen_random_uuid(),actor.organization_id,(item->>'batch_id')::uuid,issue_kind,-(item->>'quantity')::integer,
   request_id::text,trim(reason),body,actor.id);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.issue_medical_stock(uuid,uuid,uuid,integer,text,text,text,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_medical_stock(uuid,uuid,uuid,integer,text,text,text,numeric,text) TO authenticated;
