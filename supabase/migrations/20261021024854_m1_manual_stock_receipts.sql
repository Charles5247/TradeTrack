BEGIN;
ALTER TABLE track_private.stock_command_settings ADD COLUMN intake_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.stock_intakes (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id),
 created_by uuid NOT NULL REFERENCES public.users(id), revision integer NOT NULL CHECK(revision>0),
 status text NOT NULL CHECK(status IN('draft','approved','posted')),
 document jsonb NOT NULL, payload_hash text NOT NULL, approval_id uuid,
 invoice_fingerprint text, result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id)
);
CREATE INDEX stock_intakes_org_recent ON public.stock_intakes(organization_id,created_at DESC,id);
CREATE INDEX stock_intakes_invoice ON public.stock_intakes(organization_id,invoice_fingerprint) WHERE invoice_fingerprint IS NOT NULL;
CREATE TABLE public.stock_intake_revisions (
 organization_id uuid NOT NULL, receipt_id uuid NOT NULL, revision integer NOT NULL,
 document jsonb NOT NULL, payload_hash text NOT NULL, created_by uuid NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(receipt_id,revision),
 FOREIGN KEY(organization_id,receipt_id) REFERENCES public.stock_intakes(organization_id,id)
);
CREATE TABLE public.stock_intake_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, receipt_id uuid NOT NULL,
 revision integer NOT NULL, payload_hash text NOT NULL, approved_by uuid NOT NULL REFERENCES public.users(id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,receipt_id) REFERENCES public.stock_intakes(organization_id,id),
 FOREIGN KEY(receipt_id,revision) REFERENCES public.stock_intake_revisions(receipt_id,revision)
);
ALTER TABLE public.stock_intakes ADD CONSTRAINT intake_approval_fk FOREIGN KEY(approval_id) REFERENCES public.stock_intake_approvals(id);
CREATE TABLE public.stock_intake_lines (
 organization_id uuid NOT NULL, receipt_id uuid NOT NULL, id uuid NOT NULL,
 product_id uuid, product_draft_id uuid, posted_product_id uuid,
 original_quantity integer NOT NULL CHECK(original_quantity>0), purchase_unit text NOT NULL,
 conversion integer NOT NULL CHECK(conversion>0), stock_units integer NOT NULL CHECK(stock_units>0),
 receipt_unit_cost numeric(12,2) NOT NULL CHECK(receipt_unit_cost>=0), evidence jsonb NOT NULL,
 PRIMARY KEY(receipt_id,id), FOREIGN KEY(organization_id,receipt_id) REFERENCES public.stock_intakes(organization_id,id),
 FOREIGN KEY(organization_id,product_id) REFERENCES public.products(organization_id,id),
 FOREIGN KEY(organization_id,posted_product_id) REFERENCES public.products(organization_id,id),
 CHECK((product_id IS NULL)<>(product_draft_id IS NULL))
);
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['stock_intakes','stock_intake_lines','stock_intake_revisions','stock_intake_approvals'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format('CREATE POLICY intake_manager_read ON public.%I FOR SELECT TO authenticated USING (organization_id=(SELECT public.get_user_org_id()) AND (SELECT public.get_user_role()) IN (''business_owner'',''admin''))',tab);
 END LOOP;
END $$;
CREATE TRIGGER immutable_intake_revision BEFORE UPDATE OR DELETE ON public.stock_intake_revisions FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();
CREATE TRIGGER immutable_intake_approval BEFORE UPDATE OR DELETE ON public.stock_intake_approvals FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();
CREATE TRIGGER intake_audit AFTER INSERT OR UPDATE ON public.stock_intakes FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit();

CREATE FUNCTION track_private.intake_actor() RETURNS public.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active' FOR SHARE;
 IF actor.id IS NULL OR actor.organization_id IS NULL OR actor.role NOT IN('business_owner','admin') THEN RAISE EXCEPTION 'Active stock manager required'; END IF;
 PERFORM track_private.assert_active_transaction_access(actor.organization_id);
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION track_private.intake_actor() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_stock_intake(receipt_id uuid, expected_revision integer, receipt_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; existing public.stock_intakes; product public.products;
 line jsonb; prepared jsonb:='[]'; normalized jsonb; fingerprint text; hash text; units bigint; cost numeric; total numeric:=0; draft jsonb;
BEGIN
 actor:=track_private.intake_actor();
 IF NOT (SELECT intake_enabled FROM track_private.stock_command_settings WHERE singleton) THEN RAISE EXCEPTION 'Stock intake is disabled'; END IF;
 IF receipt_id IS NULL OR expected_revision IS NULL OR expected_revision<0 OR jsonb_typeof(receipt_document) IS DISTINCT FROM 'object'
  OR pg_column_size(receipt_document)>2097152 OR receipt_document->>'mode' NOT IN('opening_stock','additional_delivery')
  OR receipt_document->>'mode' IS NULL OR jsonb_typeof(receipt_document->'lines') IS DISTINCT FROM 'array'
  OR jsonb_array_length(receipt_document->'lines') NOT BETWEEN 1 AND 1000
  OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=(receipt_document->>'warehouse_id')::uuid AND organization_id=actor.organization_id)
 THEN RAISE EXCEPTION 'Valid mode, location and 1 to 1000 lines required'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['supplier','invoice_reference','notes','duplicate_reason']) AS fields(name)
  WHERE receipt_document ? fields.name AND jsonb_typeof(receipt_document->fields.name) IS DISTINCT FROM 'string')
  OR length(COALESCE(receipt_document->>'supplier',''))>255 OR length(COALESCE(receipt_document->>'invoice_reference',''))>100
  OR length(COALESCE(receipt_document->>'notes',''))>2000 OR length(COALESCE(receipt_document->>'duplicate_reason',''))>500
 THEN RAISE EXCEPTION 'Receipt references and notes must be bounded text'; END IF;
 IF (SELECT count(DISTINCT (value->>'id')::uuid) FROM jsonb_array_elements(receipt_document->'lines'))<>jsonb_array_length(receipt_document->'lines') THEN RAISE EXCEPTION 'Unique line IDs required'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(receipt_document->'lines') LOOP
  IF (line->>'id')::uuid IS NULL OR jsonb_typeof(line->'id') IS DISTINCT FROM 'string'
   OR jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(line->'conversion') IS DISTINCT FROM 'number'
   OR (line->>'quantity') !~ '^[1-9][0-9]{0,9}$' OR (line->>'conversion') !~ '^[1-9][0-9]{0,9}$'
   OR line->>'quantity' IS NULL OR line->>'conversion' IS NULL OR line->'conversion_confirmed' IS DISTINCT FROM 'true'::jsonb
   OR jsonb_typeof(line->'purchase_unit') IS DISTINCT FROM 'string'
   OR jsonb_typeof(line->'product_id') NOT IN('string','null') OR jsonb_typeof(line->'new_product') NOT IN('object','null')
   OR length(trim(COALESCE(line->>'purchase_unit',''))) NOT BETWEEN 1 AND 40
   OR jsonb_typeof(line->'receipt_unit_cost') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'Confirm positive integer quantities, purchase units, conversions and receipt costs'; END IF;
  units:=(line->>'quantity')::bigint*(line->>'conversion')::bigint;
  cost:=(line->>'receipt_unit_cost')::numeric;
  IF units NOT BETWEEN 1 AND 2147483647 OR cost<0 OR cost>9999999999.99 OR cost<>round(cost,2) THEN RAISE EXCEPTION 'Invalid stock units or receipt cost precision'; END IF;
  total:=total+cost*(line->>'quantity')::integer;
  IF total>9999999999.99 THEN RAISE EXCEPTION 'Receipt cost exceeds supported precision'; END IF;
  IF NULLIF(line->>'product_id','') IS NOT NULL THEN
   IF jsonb_typeof(line->'new_product')='object' THEN RAISE EXCEPTION 'Select an existing product or one explicit draft'; END IF;
   SELECT * INTO product FROM public.products WHERE id=(line->>'product_id')::uuid AND organization_id=actor.organization_id AND status='active' AND NOT COALESCE((to_jsonb(products)->>'medical_stock_managed')::boolean,false);
   IF NOT FOUND THEN RAISE EXCEPTION 'Active product in business required'; END IF;
   line:=line||jsonb_build_object('product_id',product.id,'new_product',NULL,'product_snapshot',jsonb_build_object('name',product.name,'sku',product.sku,'barcode',product.barcode,'make',product.make,'status',product.status,'stock_unit',to_jsonb(product)->'stock_unit','variant_size',to_jsonb(product)->'variant_size','variant_colour',to_jsonb(product)->'variant_colour','model',to_jsonb(product)->'model'));
  ELSE
   draft:=line->'new_product';
   IF jsonb_typeof(draft) IS DISTINCT FROM 'object' OR (draft->>'draft_id')::uuid IS NULL
    OR jsonb_typeof(draft->'draft_id') IS DISTINCT FROM 'string' OR jsonb_typeof(draft->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(draft->'sku') IS DISTINCT FROM 'string'
    OR jsonb_typeof(draft->'barcode') NOT IN('string','null') OR length(COALESCE(draft->>'barcode',''))>100
    OR length(trim(COALESCE(draft->>'name',''))) NOT BETWEEN 1 AND 255 OR length(trim(COALESCE(draft->>'sku',''))) NOT BETWEEN 1 AND 100
    OR draft->'confirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(draft->'selling_price') IS DISTINCT FROM 'number'
    OR jsonb_typeof(draft->'cost_price') IS DISTINCT FROM 'number'
    OR (draft->>'selling_price')::numeric NOT BETWEEN 0 AND 9999999999.99 OR (draft->>'cost_price')::numeric NOT BETWEEN 0 AND 9999999999.99
    OR round((draft->>'selling_price')::numeric,2)<>(draft->>'selling_price')::numeric OR round((draft->>'cost_price')::numeric,2)<>(draft->>'cost_price')::numeric
   THEN RAISE EXCEPTION 'Review the new product identity and explicit catalog prices'; END IF;
   draft:=draft||jsonb_build_object('draft_id',(draft->>'draft_id')::uuid,'name',trim(draft->>'name'),'sku',trim(draft->>'sku'),'barcode',trim(COALESCE(draft->>'barcode','')));
   line:=line||jsonb_build_object('product_id',NULL,'new_product',draft);
   IF EXISTS(SELECT 1 FROM public.products WHERE id=(draft->>'draft_id')::uuid OR (organization_id=actor.organization_id AND (sku=draft->>'sku' OR (NULLIF(draft->>'barcode','') IS NOT NULL AND barcode=draft->>'barcode')))) THEN RAISE EXCEPTION 'New product identifier conflicts with catalog; review required'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(prepared) p WHERE p->'new_product'->>'draft_id'=draft->>'draft_id' AND p->'new_product'<>draft) THEN RAISE EXCEPTION 'Shared product draft differs between lines'; END IF;
  END IF;
  prepared:=prepared||jsonb_build_array(line||jsonb_build_object('id',(line->>'id')::uuid,'purchase_unit',trim(line->>'purchase_unit'),'stock_units',units,'evidence',jsonb_build_object('kind','manual','entered_by',actor.id)));
 END LOOP;
 normalized:=receipt_document||jsonb_build_object('warehouse_id',(receipt_document->>'warehouse_id')::uuid,'lines',prepared,'receipt_cost_total',total,'currency',(SELECT currency FROM public.organizations WHERE id=actor.organization_id),
  'supplier',COALESCE(receipt_document->>'supplier',''),'invoice_reference',COALESCE(receipt_document->>'invoice_reference',''),'notes',COALESCE(receipt_document->>'notes',''),'duplicate_reason',COALESCE(receipt_document->>'duplicate_reason',''));
 hash:=encode(public.digest(normalized::text,'sha256'),'hex');
 IF length(trim(COALESCE(normalized->>'supplier','')))>0 AND length(trim(COALESCE(normalized->>'invoice_reference','')))>0 THEN
  fingerprint:=encode(public.digest(lower(trim(normalized->>'supplier'))||E'\n'||lower(trim(normalized->>'invoice_reference')),'sha256'),'hex');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(receipt_id::text,1801));
 SELECT * INTO existing FROM public.stock_intakes WHERE id=receipt_id FOR UPDATE;
 IF FOUND THEN
  IF existing.organization_id<>actor.organization_id THEN RAISE EXCEPTION 'Receipt unavailable'; END IF;
  IF existing.status='posted' THEN RAISE EXCEPTION 'Posted receipt is immutable'; END IF;
  -- Recover a lost save acknowledgment without silently editing a newer draft.
  IF existing.revision=expected_revision+1 AND existing.payload_hash=hash THEN RETURN to_jsonb(existing); END IF;
  IF existing.revision<>expected_revision THEN RAISE EXCEPTION 'Receipt revision changed; reload before editing'; END IF;
  UPDATE public.stock_intakes SET revision=revision+1,document=normalized,payload_hash=hash,status='draft',approval_id=NULL,invoice_fingerprint=fingerprint,updated_at=now() WHERE id=receipt_id RETURNING * INTO existing;
 ELSE
  IF expected_revision<>0 THEN RAISE EXCEPTION 'Receipt revision changed'; END IF;
  INSERT INTO public.stock_intakes(id,organization_id,created_by,revision,status,document,payload_hash,invoice_fingerprint)
   VALUES(receipt_id,actor.organization_id,actor.id,1,'draft',normalized,hash,fingerprint) RETURNING * INTO existing;
 END IF;
 INSERT INTO public.stock_intake_revisions(organization_id,receipt_id,revision,document,payload_hash,created_by)
  VALUES(actor.organization_id,receipt_id,existing.revision,normalized,hash,actor.id);
 DELETE FROM public.stock_intake_lines WHERE stock_intake_lines.receipt_id=save_stock_intake.receipt_id;
 INSERT INTO public.stock_intake_lines(organization_id,receipt_id,id,product_id,product_draft_id,original_quantity,purchase_unit,conversion,stock_units,receipt_unit_cost,evidence)
 SELECT actor.organization_id,receipt_id,(v->>'id')::uuid,NULLIF(v->>'product_id','')::uuid,(v->'new_product'->>'draft_id')::uuid,
  (v->>'quantity')::integer,v->>'purchase_unit',(v->>'conversion')::integer,(v->>'stock_units')::integer,(v->>'receipt_unit_cost')::numeric,v->'evidence' FROM jsonb_array_elements(prepared) v;
 RETURN to_jsonb(existing);
END $$;

CREATE FUNCTION public.approve_stock_intake(receipt_id uuid, expected_revision integer, expected_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; receipt public.stock_intakes; approval uuid;
BEGIN
 actor:=track_private.intake_actor();
 SELECT * INTO receipt FROM public.stock_intakes WHERE id=receipt_id AND organization_id=actor.organization_id FOR UPDATE;
 IF receipt.id IS NULL THEN RAISE EXCEPTION 'Receipt unavailable'; END IF;
 IF receipt.revision IS DISTINCT FROM expected_revision OR receipt.payload_hash IS DISTINCT FROM expected_hash THEN RAISE EXCEPTION 'Receipt changed; review again'; END IF;
 IF receipt.status='posted' THEN RETURN to_jsonb(receipt); END IF;
 IF NOT (SELECT intake_enabled FROM track_private.stock_command_settings WHERE singleton) THEN RAISE EXCEPTION 'Stock intake is disabled'; END IF;
 IF receipt.status='approved' THEN
  IF NOT EXISTS(SELECT 1 FROM public.stock_intake_approvals WHERE id=receipt.approval_id AND approved_by=actor.id) THEN RAISE EXCEPTION 'Receipt approved by another manager'; END IF;
  RETURN to_jsonb(receipt);
 END IF;
 INSERT INTO public.stock_intake_approvals(organization_id,receipt_id,revision,payload_hash,approved_by)
 VALUES(actor.organization_id,receipt.id,receipt.revision,receipt.payload_hash,actor.id) RETURNING id INTO approval;
 UPDATE public.stock_intakes SET status='approved',approval_id=approval,updated_at=now() WHERE id=receipt.id RETURNING * INTO receipt;
 RETURN to_jsonb(receipt);
END $$;

CREATE FUNCTION public.post_stock_intake(receipt_id uuid, approval_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; receipt public.stock_intakes; approval public.stock_intake_approvals; line jsonb; draft jsonb;
 product public.products; location uuid; position record; stock public.inventory; mapping jsonb:='{}'; posted_lines jsonb:='[]'; stocks jsonb:='[]'; resolved uuid; posted_result jsonb;
BEGIN
 actor:=track_private.intake_actor();
 SELECT * INTO receipt FROM public.stock_intakes WHERE id=receipt_id AND organization_id=actor.organization_id FOR UPDATE;
 IF receipt.id IS NULL THEN RAISE EXCEPTION 'Receipt unavailable'; END IF;
 SELECT * INTO approval FROM public.stock_intake_approvals a WHERE a.id=post_stock_intake.approval_id AND a.id=receipt.approval_id
  AND a.receipt_id=receipt.id AND a.revision=receipt.revision AND a.payload_hash=receipt.payload_hash AND a.approved_by=actor.id;
 IF approval.id IS NULL THEN RAISE EXCEPTION 'Recorded approval by current active manager required'; END IF;
 IF receipt.status='posted' THEN RETURN receipt.result; END IF;
 IF receipt.status<>'approved' OR NOT (SELECT intake_enabled FROM track_private.stock_command_settings WHERE singleton) THEN RAISE EXCEPTION 'Approved receipt and enabled intake required'; END IF;
 IF encode(public.digest(receipt.document::text,'sha256'),'hex')<>approval.payload_hash THEN RAISE EXCEPTION 'Approved payload differs'; END IF;
 location:=(receipt.document->>'warehouse_id')::uuid;
 IF receipt.document->>'currency' IS DISTINCT FROM (SELECT currency FROM public.organizations WHERE id=actor.organization_id) THEN RAISE EXCEPTION 'Business currency changed; review receipt again'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=location AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Location unavailable'; END IF;
 IF receipt.invoice_fingerprint IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||receipt.invoice_fingerprint,1802));
  IF EXISTS(SELECT 1 FROM public.stock_intakes WHERE organization_id=actor.organization_id AND invoice_fingerprint=receipt.invoice_fingerprint AND id<>receipt.id AND status='posted')
   AND length(trim(COALESCE(receipt.document->>'duplicate_reason','')))<8 THEN RAISE EXCEPTION 'Possible duplicate invoice; review and acknowledge with a reason'; END IF;
 END IF;
 -- Serialize competing new-product identifiers across receipt commands.
 FOR position IN SELECT DISTINCT key FROM (
  SELECT 'sku:'||(v->'new_product'->>'sku') key FROM jsonb_array_elements(receipt.document->'lines') v WHERE jsonb_typeof(v->'new_product')='object'
  UNION ALL SELECT 'barcode:'||(v->'new_product'->>'barcode') FROM jsonb_array_elements(receipt.document->'lines') v WHERE NULLIF(v->'new_product'->>'barcode','') IS NOT NULL
 ) identifiers ORDER BY key LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||position.key,1803));
 END LOOP;
 FOR line IN SELECT value FROM jsonb_array_elements(receipt.document->'lines') ORDER BY COALESCE(value->>'product_id',value->'new_product'->>'draft_id') LOOP
  IF NULLIF(line->>'product_id','') IS NOT NULL THEN
   SELECT * INTO product FROM public.products WHERE id=(line->>'product_id')::uuid AND organization_id=actor.organization_id FOR SHARE;
   IF NOT FOUND OR jsonb_build_object('name',product.name,'sku',product.sku,'barcode',product.barcode,'make',product.make,'status',product.status,'stock_unit',to_jsonb(product)->'stock_unit','variant_size',to_jsonb(product)->'variant_size','variant_colour',to_jsonb(product)->'variant_colour','model',to_jsonb(product)->'model') IS DISTINCT FROM line->'product_snapshot'
    OR product.status<>'active' THEN RAISE EXCEPTION 'Product identity changed; review receipt again'; END IF;
   resolved:=product.id;
  ELSE
   draft:=line->'new_product'; resolved:=(draft->>'draft_id')::uuid;
   IF NOT mapping ? resolved::text THEN
    IF EXISTS(SELECT 1 FROM public.products WHERE organization_id=actor.organization_id AND (sku=draft->>'sku' OR (NULLIF(draft->>'barcode','') IS NOT NULL AND barcode=draft->>'barcode'))) THEN RAISE EXCEPTION 'New product identifier conflicts; review again'; END IF;
    INSERT INTO public.products(id,organization_id,name,sku,barcode,selling_price,cost_price,created_by)
     VALUES(resolved,actor.organization_id,trim(draft->>'name'),trim(draft->>'sku'),NULLIF(draft->>'barcode',''),(draft->>'selling_price')::numeric,(draft->>'cost_price')::numeric,actor.id);
    mapping:=mapping||jsonb_build_object(resolved::text,resolved);
   END IF;
  END IF;
  posted_lines:=posted_lines||jsonb_build_array(jsonb_build_object('line_id',line->>'id','product_id',resolved,'stock_units',(line->>'stock_units')::integer));
 END LOOP;
 FOR position IN SELECT (v->>'product_id')::uuid product_id,sum((v->>'stock_units')::bigint) units FROM jsonb_array_elements(posted_lines) v GROUP BY 1 ORDER BY 1 LOOP
  IF position.units>2147483647 THEN RAISE EXCEPTION 'Combined stock quantity exceeds integer limit'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||position.product_id::text||location::text,1703));
  SELECT * INTO stock FROM public.inventory WHERE organization_id=actor.organization_id AND product_id=position.product_id AND warehouse_id=location FOR UPDATE;
  PERFORM set_config('track.reason','Approved stock receipt '||receipt.id::text,true);
  IF receipt.document->>'mode'='opening_stock' THEN
   IF stock.id IS NOT NULL OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE organization_id=actor.organization_id AND product_id=position.product_id AND warehouse_id=location) THEN RAISE EXCEPTION 'Opening stock is no longer initial; use additional delivery'; END IF;
   INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity,min_stock_level) VALUES(actor.organization_id,position.product_id,location,position.units,5) RETURNING * INTO stock;
  ELSE
   IF COALESCE(stock.quantity,0)::bigint+position.units>2147483647 THEN RAISE EXCEPTION 'Resulting stock exceeds integer limit'; END IF;
   INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity,min_stock_level) VALUES(actor.organization_id,position.product_id,location,0,5) ON CONFLICT(product_id,warehouse_id) DO NOTHING;
   UPDATE public.inventory SET quantity=quantity+position.units,original_device_timestamp=NULL WHERE organization_id=actor.organization_id AND product_id=position.product_id AND warehouse_id=location RETURNING * INTO stock;
  END IF;
  IF stock.id IS NULL THEN RAISE EXCEPTION 'Stock position requires tenant reconciliation before posting'; END IF;
  stocks:=stocks||jsonb_build_array(jsonb_build_object('id',stock.id,'product_id',stock.product_id,'warehouse_id',stock.warehouse_id,'quantity',stock.quantity,'added',position.units));
 END LOOP;
 UPDATE public.stock_intake_lines l SET posted_product_id=(v->>'product_id')::uuid FROM jsonb_array_elements(posted_lines) v WHERE l.receipt_id=receipt.id AND l.id=(v->>'line_id')::uuid;
 posted_result:=jsonb_build_object('receipt_id',receipt.id,'approval_id',approval.id,'status','posted','receipt_cost_total',receipt.document->'receipt_cost_total','stocks',stocks,'lines',posted_lines,'posted_at',now());
 UPDATE public.stock_intakes SET status='posted',result=posted_result,updated_at=now() WHERE id=receipt.id;
 RETURN posted_result;
END $$;
REVOKE ALL ON FUNCTION public.save_stock_intake(uuid,integer,jsonb),public.approve_stock_intake(uuid,integer,text),public.post_stock_intake(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_stock_intake(uuid,integer,jsonb),public.approve_stock_intake(uuid,integer,text),public.post_stock_intake(uuid,uuid) TO authenticated;
COMMIT;
