BEGIN;
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
COMMIT;
