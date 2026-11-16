-- Server-owned stock reviews. No hosted deployment or retention period is implied.
-- The existing (job,row) receipt is the business intent; each selection has its
-- own immutable execution IDs. No client can write these tables directly.
BEGIN;

ALTER TABLE public.ai_jobs
  ADD COLUMN source_kind text CHECK (source_kind IN ('text','csv','xlsx','image','audio')),
  ADD COLUMN source_text text,
  ADD COLUMN source_hash text CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN source_byte_length integer CHECK (source_byte_length >= 0),
  ADD COLUMN source_metadata jsonb,
  ADD COLUMN review_closed_at timestamptz;

CREATE TABLE public.ai_stock_review_revisions (
  job_id uuid NOT NULL REFERENCES public.ai_jobs(id),
  revision integer NOT NULL CHECK (revision > 0),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  owner_id uuid NOT NULL REFERENCES public.users(id),
  source_hash text,
  rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (job_id, revision)
);
CREATE TABLE public.ai_stock_review_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  revision integer NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  owner_id uuid NOT NULL REFERENCES public.users(id),
  row_indices integer[] NOT NULL,
  rows jsonb NOT NULL,
  groups jsonb NOT NULL,
  dependencies jsonb NOT NULL,
  review_digest text NOT NULL CHECK (review_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approval_id uuid UNIQUE,
  approved_by uuid REFERENCES public.users(id),
  approved_at timestamptz,
  outcomes jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY (job_id, revision) REFERENCES public.ai_stock_review_revisions(job_id, revision),
  CHECK ((approval_id IS NULL AND approved_by IS NULL AND approved_at IS NULL)
    OR (approval_id IS NOT NULL AND approved_by = owner_id AND approved_at IS NOT NULL))
);
CREATE INDEX ai_stock_review_selections_job ON public.ai_stock_review_selections(job_id, created_at);
ALTER TABLE public.ai_stock_receipts
  ADD COLUMN review_revision integer,
  ADD COLUMN approval_id uuid,
  ADD COLUMN operation_id uuid,
  ADD COLUMN review_digest text;
-- Existing hosted default ACLs can be broader than the original migration's
-- SELECT grant. RLS does not protect TRUNCATE or remove inherited table grants.
REVOKE ALL ON public.ai_stock_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_stock_receipts TO authenticated;
DROP POLICY IF EXISTS ai_stock_receipts_owner_read ON public.ai_stock_receipts;
CREATE POLICY ai_stock_receipts_owner_read ON public.ai_stock_receipts FOR SELECT TO authenticated
  USING (approved_by=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.users u
    WHERE u.id=(SELECT auth.uid()) AND u.organization_id=ai_stock_receipts.organization_id
      AND u.role='business_owner' AND u.status='active'));

ALTER TABLE public.ai_stock_review_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_stock_review_selections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_stock_review_revisions, public.ai_stock_review_selections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_stock_review_revisions, public.ai_stock_review_selections TO authenticated;
CREATE POLICY stock_review_owner_read ON public.ai_stock_review_revisions FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.organization_id = ai_stock_review_revisions.organization_id
      AND u.role = 'business_owner' AND u.status = 'active'));
CREATE POLICY stock_selection_owner_read ON public.ai_stock_review_selections FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.organization_id = ai_stock_review_selections.organization_id
      AND u.role = 'business_owner' AND u.status = 'active'));
CREATE TRIGGER stock_review_immutable BEFORE UPDATE OR DELETE ON public.ai_stock_review_revisions
  FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();

CREATE FUNCTION track_private.guard_stock_selection() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE entry record;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Selection history is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['approval_id','approved_by','approved_at','outcomes'])
    IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['approval_id','approved_by','approved_at','outcomes'])
    OR (OLD.approval_id IS NOT NULL AND
      ROW(NEW.approval_id,NEW.approved_by,NEW.approved_at) IS DISTINCT FROM ROW(OLD.approval_id,OLD.approved_by,OLD.approved_at))
    OR jsonb_typeof(NEW.outcomes) <> 'object' THEN
    RAISE EXCEPTION 'Selection payload and approval are immutable';
  END IF;
  FOR entry IN SELECT * FROM jsonb_each(OLD.outcomes) LOOP
    IF NEW.outcomes->entry.key IS DISTINCT FROM entry.value THEN RAISE EXCEPTION 'Operation results are immutable'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_selection_immutable BEFORE UPDATE OR DELETE ON public.ai_stock_review_selections
  FOR EACH ROW EXECUTE FUNCTION track_private.guard_stock_selection();

-- Raw originals and metadata must not enter permanent audit history.
CREATE FUNCTION track_private.audit_stock_ai_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE before_value jsonb; after_value jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN before_value := to_jsonb(OLD) - ARRAY['source_text','source_metadata']; END IF;
  after_value := to_jsonb(NEW) - ARRAY['source_text','source_metadata'];
  IF jsonb_typeof(after_value->'result')='object' THEN after_value := jsonb_set(after_value,'{result}',(after_value->'result')-'transcript'); END IF;
  IF jsonb_typeof(before_value->'result')='object' THEN before_value := jsonb_set(before_value,'{result}',(before_value->'result')-'transcript'); END IF;
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,old_values,new_values,correlation_id)
    VALUES(NEW.organization_id,auth.uid(),TG_OP,'ai_jobs',NEW.id,before_value,
      after_value,NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ai_audit ON public.ai_jobs;
CREATE TRIGGER ai_audit AFTER INSERT OR UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION track_private.audit_stock_ai_job();
-- The upstream finish function separately emits AI_SUGGESTION. Preserve its
-- status/result behavior while excluding voice originals from that audit copy.
DO $$
DECLARE definition text;
BEGIN
  IF to_regprocedure('public.finish_ai_job(uuid,jsonb,boolean)') IS NOT NULL THEN
    definition := pg_get_functiondef('public.finish_ai_job(uuid,jsonb,boolean)'::regprocedure);
    IF position($audit$'ai_jobs',job,output)$audit$ IN definition)=0 THEN
      RAISE EXCEPTION 'Unexpected finish_ai_job audit dependency; review migration';
    END IF;
    EXECUTE replace(definition,$audit$'ai_jobs',job,output)$audit$,$audit$'ai_jobs',job,(output - 'transcript'))$audit$);
  END IF;
END $$;
CREATE FUNCTION track_private.guard_stock_source() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.source_hash IS NOT NULL AND ROW(NEW.source_kind,NEW.source_text,NEW.source_hash,NEW.source_byte_length,NEW.source_metadata)
    IS DISTINCT FROM ROW(OLD.source_kind,OLD.source_text,OLD.source_hash,OLD.source_byte_length,OLD.source_metadata) THEN
    RAISE EXCEPTION 'Source evidence is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_source_immutable BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION track_private.guard_stock_source();

CREATE FUNCTION track_private.stock_review_actor(p_require_access boolean) RETURNS public.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; locked record; eligibility jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = (SELECT auth.uid()) FOR SHARE;
  IF actor.id IS NULL OR actor.role <> 'business_owner' OR actor.status <> 'active' OR actor.organization_id IS NULL THEN
    RAISE EXCEPTION 'STOCK_REVIEW_FORBIDDEN: An active business owner is required';
  END IF;
  -- Keep the same lock order for status/replay and first execution. Parent locks
  -- also serialize new subscription/product inserts through their real FKs.
  PERFORM 1 FROM public.organizations WHERE id = actor.organization_id FOR UPDATE;
  FOR locked IN SELECT id FROM public.subscriptions WHERE organization_id = actor.organization_id ORDER BY id FOR SHARE LOOP NULL; END LOOP;
  IF p_require_access THEN
    IF track_private.assert_ai_access() IS DISTINCT FROM actor.organization_id THEN
      RAISE EXCEPTION 'STOCK_REVIEW_FORBIDDEN: AI is not available for this business';
    END IF;
    eligibility := public.verify_business_subscription();
    IF eligibility->>'valid_until' IS NULL OR (eligibility->>'valid_until')::timestamptz<=clock_timestamp() THEN
      RAISE EXCEPTION 'STOCK_REVIEW_FORBIDDEN: AI access expired before this operation';
    END IF;
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION public.attach_ai_stock_source(p_job_id uuid,p_kind text,p_content text,p_metadata jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; job public.ai_jobs; fingerprint text; byte_count integer; kept_text text;
BEGIN
  actor := track_private.stock_review_actor(true);
  SELECT * INTO job FROM public.ai_jobs WHERE id = p_job_id AND organization_id = actor.organization_id AND user_id = actor.id FOR UPDATE;
  IF job.id IS NULL OR job.kind <> 'inventory' OR job.status <> 'pending' THEN RAISE EXCEPTION 'STOCK_REVIEW_NOT_FOUND: Pending source job not found'; END IF;
  IF p_kind IS NULL OR p_kind <> ALL(ARRAY['text','csv','xlsx','image','audio']) OR p_content IS NULL
    OR p_content = '' OR length(p_content) > (CASE WHEN p_kind IN ('image','audio') THEN 3000000 ELSE 200000 END)
    OR jsonb_typeof(p_metadata) IS DISTINCT FROM 'object'
    OR p_metadata->>'purpose' IS NULL OR p_metadata->>'purpose' <> ALL(ARRAY['stock_intake','po_compare'])
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_metadata) k WHERE k <> ALL(ARRAY['purpose','file_name']))
    OR (p_metadata ? 'file_name' AND (jsonb_typeof(p_metadata->'file_name') <> 'string' OR length(p_metadata->>'file_name') > 255)) THEN
    RAISE EXCEPTION 'STOCK_REVIEW_INVALID: Invalid source evidence';
  END IF;
  fingerprint := encode(sha256(convert_to(p_content,'UTF8')),'hex');
  byte_count := octet_length(convert_to(p_content,'UTF8'));
  kept_text := CASE WHEN p_kind IN ('text','csv','xlsx') THEN p_content ELSE NULL END;
  IF job.source_hash IS NOT NULL THEN
    IF ROW(job.source_kind,job.source_text,job.source_hash,job.source_byte_length,job.source_metadata)
      IS DISTINCT FROM ROW(p_kind,kept_text,fingerprint,byte_count,p_metadata) THEN RAISE EXCEPTION 'STOCK_REVIEW_CONFLICT: Source already attached'; END IF;
    RETURN;
  END IF;
  UPDATE public.ai_jobs SET source_kind=p_kind,source_text=kept_text,source_hash=fingerprint,
    source_byte_length=byte_count,source_metadata=p_metadata WHERE id=job.id;
END $$;

CREATE FUNCTION track_private.stock_review_job(p_job_id uuid,p_require_access boolean,p_allow_closed boolean DEFAULT false)
RETURNS public.ai_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; job public.ai_jobs;
BEGIN
  actor := track_private.stock_review_actor(p_require_access);
  SELECT * INTO job FROM public.ai_jobs WHERE id=p_job_id AND organization_id=actor.organization_id
    AND user_id=actor.id AND kind='inventory' AND status='ready' FOR UPDATE;
  IF job.id IS NULL OR job.source_metadata->>'purpose' = 'po_compare'
    OR (job.review_closed_at IS NOT NULL AND NOT p_allow_closed) THEN
    RAISE EXCEPTION 'STOCK_REVIEW_NOT_FOUND: Stock review not found';
  END IF;
  RETURN job;
END $$;

CREATE FUNCTION track_private.stock_review_validate_rows(p_rows jsonb,p_count integer) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE row_value jsonb; position integer := 0; field text;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) <> p_count OR p_count < 1 THEN
    RAISE EXCEPTION 'STOCK_REVIEW_INVALID: Keep every original source row';
  END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' OR row_value->'row_index' IS DISTINCT FROM to_jsonb(position)
      OR row_value->>'mode' IS NULL OR row_value->>'mode' <> ALL(ARRAY['existing','new'])
      OR jsonb_typeof(row_value->'zero_confirmed') IS DISTINCT FROM 'boolean'
      OR (SELECT count(*) FROM jsonb_object_keys(row_value)) <> 11
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(row_value) k WHERE k <> ALL(ARRAY[
        'row_index','mode','product_id','warehouse_id','quantity','unit_cost','zero_confirmed','name','sku','stock_unit','selling_price'])) THEN
      RAISE EXCEPTION 'STOCK_REVIEW_INVALID: Invalid review row';
    END IF;
    FOREACH field IN ARRAY ARRAY['product_id','warehouse_id','quantity','unit_cost','selling_price'] LOOP
      IF jsonb_typeof(row_value->field) IS NULL OR jsonb_typeof(row_value->field) <> ALL(ARRAY['null','string']) THEN
        RAISE EXCEPTION 'STOCK_REVIEW_INVALID: Draft values must be strings or unresolved';
      END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['name','sku','stock_unit'] LOOP
      IF jsonb_typeof(row_value->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'STOCK_REVIEW_INVALID: Invalid product draft'; END IF;
    END LOOP;
    position := position + 1;
  END LOOP;
END $$;

CREATE FUNCTION public.save_ai_stock_review(p_job_id uuid,p_expected_revision integer,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job public.ai_jobs; latest public.ai_stock_review_revisions; receipt public.ai_stock_receipts; candidate jsonb; next_revision integer;
BEGIN
  job := track_private.stock_review_job(p_job_id,true);
  IF job.source_hash IS NULL THEN RAISE EXCEPTION 'SOURCE_EVIDENCE_REQUIRED: Resubmit the source before a new reviewed receipt'; END IF;
  SELECT * INTO latest FROM public.ai_stock_review_revisions WHERE job_id=job.id ORDER BY revision DESC LIMIT 1;
  IF latest.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT: Reload the saved review'; END IF;
  PERFORM track_private.stock_review_validate_rows(p_rows,jsonb_array_length(job.result->'rows'));
  -- Never edit a completed group's business values, including legacy receipts.
  FOR receipt IN SELECT * FROM public.ai_stock_receipts WHERE job_id=job.id LOOP
    candidate := p_rows->receipt.row_index;
    IF candidate->>'mode' IS DISTINCT FROM (CASE WHEN receipt.created_product THEN 'new' ELSE 'existing' END)
      OR candidate->>'warehouse_id' IS DISTINCT FROM receipt.warehouse_id::text
      OR COALESCE(candidate->>'quantity','') !~ '^\d+$'
      OR COALESCE(candidate->>'unit_cost','') !~ '^\d+(\.\d{1,2})?$' THEN
      RAISE EXCEPTION 'COMPLETED_ROW_IMMUTABLE: A saved receipt cannot be edited';
    END IF;
    IF (candidate->>'quantity')::numeric <> receipt.quantity OR (candidate->>'unit_cost')::numeric <> receipt.unit_cost
      OR (receipt.unit_cost=0 AND candidate->>'zero_confirmed' <> 'true')
      OR (NOT receipt.created_product AND candidate->>'product_id' IS DISTINCT FROM receipt.product_id::text)
      OR (receipt.created_product AND (btrim(candidate->>'name') IS DISTINCT FROM receipt.approved_product->>'name'
        OR btrim(candidate->>'sku') IS DISTINCT FROM receipt.approved_product->>'sku'
        OR candidate->>'stock_unit' IS DISTINCT FROM receipt.approved_product->>'stock_unit'
        OR COALESCE(candidate->>'selling_price','') !~ '^\d+(\.\d{1,2})?$')) THEN
      RAISE EXCEPTION 'COMPLETED_ROW_IMMUTABLE: A saved receipt cannot be edited';
    END IF;
    IF receipt.created_product AND (candidate->>'selling_price')::numeric <> (receipt.approved_product->>'selling_price')::numeric THEN
      RAISE EXCEPTION 'COMPLETED_ROW_IMMUTABLE: A saved product price cannot be edited';
    END IF;
  END LOOP;
  next_revision := COALESCE(latest.revision,0)+1;
  INSERT INTO public.ai_stock_review_revisions(job_id,revision,organization_id,owner_id,source_hash,rows)
    VALUES(job.id,next_revision,job.organization_id,job.user_id,job.source_hash,p_rows);
  -- Terminalize superseded operations now, before a repaired selection can
  -- legitimately complete this same job-row business intent with new effects.
  PERFORM track_private.stock_review_finalize(job);
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values,correlation_id)
    VALUES(job.organization_id,job.user_id,'AI_REVIEW_SAVED','ai_jobs',job.id,jsonb_build_object('revision',next_revision,'source_hash',job.source_hash),job.id);
  RETURN jsonb_build_object('revision',next_revision,'rows',p_rows);
END $$;

-- One arithmetic function is used by both preview and the existing domain receipt.
CREATE FUNCTION track_private.stock_review_average(p_stock integer,p_average numeric,p_quantity integer,p_cost numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT round((p_stock::numeric*p_average+p_quantity::numeric*p_cost)/(p_stock::numeric+p_quantity),2)
$$;
CREATE OR REPLACE FUNCTION track_private.apply_purchase_cost_receipt(
  p_org uuid,p_product uuid,p_warehouse uuid,p_order uuid,p_source uuid,p_quantity integer,
  p_unit_cost numeric,p_actor uuid,p_already_added boolean,p_notes text
) RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE product_row public.products; stock_row record; old_quantity integer := 0; new_cost numeric(12,2);
BEGIN
  IF p_quantity <= 0 OR p_unit_cost < 0 THEN RAISE EXCEPTION 'Invalid receipt quantity or cost'; END IF;
  SELECT * INTO product_row FROM public.products WHERE id=p_product AND organization_id=p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase product does not belong to this business'; END IF;
  FOR stock_row IN SELECT quantity FROM public.inventory WHERE organization_id=p_org AND product_id=p_product ORDER BY id FOR UPDATE LOOP
    old_quantity := old_quantity+stock_row.quantity;
  END LOOP;
  IF p_already_added THEN
    old_quantity := old_quantity-p_quantity;
    IF old_quantity < 0 THEN RAISE EXCEPTION 'Received stock is less than the order quantity'; END IF;
  ELSE
    INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity,min_stock_level)
      VALUES(p_org,p_product,p_warehouse,p_quantity,5)
      ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity=public.inventory.quantity+EXCLUDED.quantity;
    INSERT INTO public.inventory_movements(organization_id,product_id,warehouse_id,movement_type,quantity,reference_id,reference_type,notes,created_by)
      VALUES(p_org,p_product,p_warehouse,'in',p_quantity,COALESCE(p_order,p_source),
        CASE WHEN p_order IS NULL THEN 'stock_receipt' ELSE 'purchase_order' END,
        COALESCE(NULLIF(trim(p_notes),''),'Received from purchase order'),p_actor);
  END IF;
  new_cost := track_private.stock_review_average(old_quantity,product_row.cost_price,p_quantity,p_unit_cost);
  UPDATE public.products SET cost_price=new_cost WHERE id=p_product;
  INSERT INTO public.product_cost_history(organization_id,product_id,warehouse_id,source_type,source_id,
    purchase_order_id,purchase_order_item_id,previous_stock,received_quantity,unit_cost,previous_average_cost,new_average_cost,recorded_by,notes)
    VALUES(p_org,p_product,p_warehouse,CASE WHEN p_order IS NULL THEN 'stock_receipt' ELSE 'purchase_order' END,
      p_source,p_order,CASE WHEN p_order IS NULL THEN NULL ELSE p_source END,old_quantity,p_quantity,p_unit_cost,product_row.cost_price,new_cost,p_actor,p_notes);
  RETURN new_cost;
END $$;

-- Keep domain behavior private, including atomic new-product creation and limits.
ALTER FUNCTION public.apply_ai_stock_receipt(uuid,integer,uuid,uuid,integer,numeric) SET SCHEMA track_private;
ALTER FUNCTION track_private.apply_ai_stock_receipt(uuid,integer,uuid,uuid,integer,numeric) RENAME TO apply_ai_stock_receipt_base;
DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.apply_ai_new_product_receipt(uuid,integer,text,text,text,numeric,uuid,integer,numeric)'::regprocedure);
  IF position('public.apply_ai_stock_receipt(' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected AI product receipt dependency; review migration'; END IF;
  EXECUTE replace(definition,'public.apply_ai_stock_receipt(','track_private.apply_ai_stock_receipt_base(');
END $$;
ALTER FUNCTION public.apply_ai_new_product_receipt(uuid,integer,text,text,text,numeric,uuid,integer,numeric) SET SCHEMA track_private;
ALTER FUNCTION track_private.apply_ai_new_product_receipt(uuid,integer,text,text,text,numeric,uuid,integer,numeric) RENAME TO apply_ai_new_product_receipt_base;

CREATE FUNCTION public.apply_ai_stock_receipt(p_job_id uuid,p_row_index integer,p_product_id uuid,p_warehouse_id uuid,p_quantity integer,p_unit_cost numeric)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job public.ai_jobs; prior public.ai_stock_receipts;
BEGIN
  job := track_private.stock_review_job(p_job_id,false,true);
  SELECT * INTO prior FROM public.ai_stock_receipts WHERE job_id=job.id AND row_index=p_row_index;
  IF prior.id IS NULL THEN RAISE EXCEPTION 'APPROVAL_REQUIRED: Review and approve a server selection first'; END IF;
  IF prior.created_product OR prior.product_id IS DISTINCT FROM p_product_id OR prior.warehouse_id IS DISTINCT FROM p_warehouse_id
    OR prior.quantity IS DISTINCT FROM p_quantity OR prior.unit_cost IS DISTINCT FROM p_unit_cost THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: This row has different saved effects';
  END IF;
  RETURN prior.average_cost;
END $$;
CREATE FUNCTION public.apply_ai_new_product_receipt(p_job_id uuid,p_row_index integer,p_name text,p_sku text,p_stock_unit text,
  p_selling_price numeric,p_warehouse_id uuid,p_quantity integer,p_unit_cost numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job public.ai_jobs; prior public.ai_stock_receipts;
BEGIN
  job := track_private.stock_review_job(p_job_id,false,true);
  SELECT * INTO prior FROM public.ai_stock_receipts WHERE job_id=job.id AND row_index=p_row_index;
  IF prior.id IS NULL THEN RAISE EXCEPTION 'APPROVAL_REQUIRED: Review and approve a server selection first'; END IF;
  IF NOT prior.created_product OR prior.approved_product IS DISTINCT FROM jsonb_build_object('name',btrim(p_name),'sku',btrim(p_sku),
    'stock_unit',p_stock_unit,'selling_price',p_selling_price) OR prior.warehouse_id IS DISTINCT FROM p_warehouse_id
    OR prior.quantity IS DISTINCT FROM p_quantity OR prior.unit_cost IS DISTINCT FROM p_unit_cost THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: This row has different saved effects';
  END IF;
  RETURN prior.product_id;
END $$;

CREATE FUNCTION track_private.stock_review_group(p_job public.ai_jobs,p_row jsonb,p_selection_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  product public.products; location public.warehouses; stock record;
  product_id uuid; warehouse_id uuid; quantity integer; unit_cost numeric; selling_price numeric;
  all_stock bigint := 0; destination_stock integer := 0; old_cost numeric := 0;
  inventory_snapshot jsonb := '[]'; dependencies jsonb; display_name text; display_unit text;
  product_token text; warehouse_token text; name_available boolean; sku_available boolean;
BEGIN
  IF p_row->>'mode' IS NULL OR COALESCE(p_row->>'quantity','') !~ '^\d+$'
    OR length(p_row->>'quantity') > 10 OR (p_row->>'quantity')::numeric NOT BETWEEN 1 AND 2147483647
    OR COALESCE(p_row->>'unit_cost','') !~ '^\d+(\.\d{1,2})?$'
    OR length(p_row->>'unit_cost') > 13 OR (p_row->>'unit_cost')::numeric > 9999999999.99
    OR ((p_row->>'unit_cost')::numeric=0 AND p_row->>'zero_confirmed' IS DISTINCT FROM 'true')
    OR COALESCE(p_row->>'warehouse_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'REVIEW_NOT_READY: Resolve product, destination, whole quantity and known buying cost';
  END IF;
  warehouse_id := (p_row->>'warehouse_id')::uuid;
  quantity := (p_row->>'quantity')::integer;
  unit_cost := (p_row->>'unit_cost')::numeric;
  IF p_row->>'mode'='existing' THEN
    IF COALESCE(p_row->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'REVIEW_NOT_READY: Choose a catalog product';
    END IF;
    product_id := (p_row->>'product_id')::uuid;
    SELECT * INTO product FROM public.products WHERE id=product_id AND organization_id=p_job.organization_id FOR UPDATE;
    IF product.id IS NULL OR product.status IS DISTINCT FROM 'active' OR COALESCE(product.medical_stock_managed,false) THEN
      RAISE EXCEPTION 'REVIEW_NOT_READY: Choose an active ordinary product in this business';
    END IF;
    SELECT xmin::text INTO product_token FROM public.products WHERE id=product.id;
    display_name := product.name; display_unit := product.stock_unit; old_cost := product.cost_price;
  ELSE
    IF length(btrim(p_row->>'name')) NOT BETWEEN 1 AND 255 OR length(btrim(p_row->>'sku')) NOT BETWEEN 1 AND 100
      OR p_row->>'stock_unit' <> ALL(ARRAY['piece','pair','pack','carton','bag','g','kg','mL','L','cm','m','yard','bale','bundle','roll','dozen','set','tablet','bottle','vial'])
      OR COALESCE(p_row->>'selling_price','') !~ '^\d+(\.\d{1,2})?$' OR length(p_row->>'selling_price') > 13
      OR (p_row->>'selling_price')::numeric > 9999999999.99 THEN
      RAISE EXCEPTION 'REVIEW_NOT_READY: Resolve the new product name, SKU, unit and selling price';
    END IF;
    selling_price := (p_row->>'selling_price')::numeric;
    display_name := btrim(p_row->>'name'); display_unit := p_row->>'stock_unit';
    FOR stock IN SELECT id FROM public.products WHERE organization_id=p_job.organization_id ORDER BY id FOR SHARE LOOP NULL; END LOOP;
    SELECT NOT EXISTS(SELECT 1 FROM public.products WHERE organization_id=p_job.organization_id AND lower(name)=lower(display_name)),
      NOT EXISTS(SELECT 1 FROM public.products WHERE organization_id=p_job.organization_id AND lower(sku)=lower(btrim(p_row->>'sku')))
      INTO name_available,sku_available;
    IF NOT name_available OR NOT sku_available THEN RAISE EXCEPTION 'REVIEW_NOT_READY: Match the existing name or SKU instead of creating a duplicate'; END IF;
  END IF;
  SELECT * INTO location FROM public.warehouses WHERE id=warehouse_id AND organization_id=p_job.organization_id FOR SHARE;
  IF location.id IS NULL THEN RAISE EXCEPTION 'REVIEW_NOT_READY: Choose a warehouse in this business'; END IF;
  SELECT xmin::text INTO warehouse_token FROM public.warehouses WHERE id=location.id;
  IF product.id IS NOT NULL THEN
    -- FOR UPDATE on the FK parent also prevents a new inventory location from
    -- committing between this snapshot and receipt; existing rows are locked.
    FOR stock IN SELECT i.*,i.xmin::text AS row_token FROM public.inventory i
      WHERE i.organization_id=p_job.organization_id AND i.product_id=product.id ORDER BY i.id FOR UPDATE LOOP
      IF stock.quantity < 0 THEN RAISE EXCEPTION 'REVIEW_NOT_READY: Reconcile negative stock before receiving'; END IF;
      all_stock := all_stock+stock.quantity;
      IF stock.warehouse_id=location.id THEN destination_stock := stock.quantity; END IF;
      inventory_snapshot := inventory_snapshot || jsonb_build_array(jsonb_build_object(
        'id',stock.id,'warehouse_id',stock.warehouse_id,'quantity',stock.quantity,'version',stock.row_token));
    END LOOP;
    IF old_cost < 0 OR old_cost::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'REVIEW_NOT_READY: Review existing valuation'; END IF;
    IF all_stock > 0 AND old_cost=0 THEN RAISE EXCEPTION 'EXISTING_VALUATION_REVIEW_REQUIRED: Existing zero-cost stock is not evidence of known-free valuation'; END IF;
    dependencies := jsonb_build_object('product',jsonb_build_object('id',product.id,'version',product_token,
      'name',product.name,'sku',product.sku,'barcode',product.barcode,'stock_unit',product.stock_unit,
      'status',product.status,'medical_stock_managed',COALESCE(product.medical_stock_managed,false),'cost_minor',(product.cost_price*100)::bigint::text),
      'inventory',inventory_snapshot);
  ELSE
    -- Capacity is rechecked by the existing domain operation, not a dependency:
    -- successfully creating one selected product must not stale another one.
    dependencies := jsonb_build_object('new_product',jsonb_build_object('name',display_name,'sku',btrim(p_row->>'sku'),
      'name_available',name_available,'sku_available',sku_available));
  END IF;
  IF all_stock+quantity > 2147483647 OR destination_stock::bigint+quantity > 2147483647 THEN
    RAISE EXCEPTION 'REVIEW_NOT_READY: Receipt exceeds the supported stock range';
  END IF;
  dependencies := dependencies || jsonb_build_object('warehouse',jsonb_build_object('id',location.id,'name',location.name,'version',warehouse_token));
  RETURN jsonb_build_object('dependencies',dependencies,'group',jsonb_build_object(
    'row_index',(p_row->>'row_index')::integer,
    'operation_id',md5(p_selection_id::text || ':' || (p_row->>'row_index'))::uuid,
    'receipt_id',md5(p_job.id::text || ':' || (p_row->>'row_index'))::uuid,
    'mode',p_row->>'mode','product_id',product.id,'warehouse_id',location.id,
    'product_name',display_name,'warehouse_name',location.name,'stock_unit',display_unit,
    'quantity',quantity,'cost_kind',CASE WHEN unit_cost=0 THEN 'free' ELSE 'paid' END,
    'unit_cost_minor',(unit_cost*100)::bigint::text,
    'selling_price_minor',CASE WHEN selling_price IS NULL THEN NULL ELSE (selling_price*100)::bigint::text END,
    'stock_before',destination_stock,'stock_after',destination_stock+quantity,
    'cost_before_minor',(old_cost*100)::bigint::text,
    'cost_after_minor',(track_private.stock_review_average(all_stock::integer,old_cost,quantity,unit_cost)*100)::bigint::text));
END $$;

CREATE FUNCTION track_private.stock_review_completed(p_selected public.ai_stock_review_selections,p_row_index integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE receipt public.ai_stock_receipts; effect jsonb; row_value jsonb;
BEGIN
  SELECT * INTO receipt FROM public.ai_stock_receipts WHERE job_id=p_selected.job_id AND row_index=p_row_index;
  IF receipt.id IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO effect FROM jsonb_array_elements(p_selected.groups) WHERE (value->>'row_index')::integer=p_row_index;
  row_value := p_selected.rows->p_row_index::text;
  IF receipt.organization_id<>p_selected.organization_id OR receipt.approved_by<>p_selected.owner_id
    OR receipt.warehouse_id::text IS DISTINCT FROM effect->>'warehouse_id' OR receipt.quantity IS DISTINCT FROM (effect->>'quantity')::integer
    OR receipt.unit_cost*100 IS DISTINCT FROM (effect->>'unit_cost_minor')::numeric
    OR receipt.created_product IS DISTINCT FROM (effect->>'mode'='new')
    OR (NOT receipt.created_product AND receipt.product_id::text IS DISTINCT FROM effect->>'product_id')
    OR (receipt.created_product AND receipt.approved_product IS DISTINCT FROM jsonb_build_object('name',btrim(row_value->>'name'),
      'sku',btrim(row_value->>'sku'),'stock_unit',row_value->>'stock_unit','selling_price',(effect->>'selling_price_minor')::numeric/100)) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: This business intent has different saved effects';
  END IF;
  RETURN jsonb_build_object('status','completed','row_index',p_row_index,'operation_id',effect->'operation_id',
    'receipt_id',effect->'receipt_id','product_id',receipt.product_id,'average_cost',receipt.average_cost);
END $$;

CREATE FUNCTION track_private.stock_review_record_outcome(p_selection_id uuid,p_row_index integer,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE selected public.ai_stock_review_selections; prior jsonb;
BEGIN
  SELECT * INTO selected FROM public.ai_stock_review_selections WHERE id=p_selection_id FOR UPDATE;
  prior := selected.outcomes->p_row_index::text;
  IF prior IS NOT NULL THEN RETURN prior; END IF;
  UPDATE public.ai_stock_review_selections SET outcomes=outcomes || jsonb_build_object(p_row_index::text,p_result) WHERE id=selected.id;
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values,correlation_id)
    VALUES(selected.organization_id,selected.owner_id,'AI_OPERATION_RESULT','ai_stock_review_selections',selected.id,
      jsonb_build_object('approval_id',selected.approval_id,'revision',selected.revision,'review_digest',selected.review_digest,'result',p_result),selected.job_id);
  RETURN p_result;
END $$;

CREATE FUNCTION track_private.stock_review_no_effect(p_selected public.ai_stock_review_selections,p_row_index integer,p_code text,p_message text,p_changes jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE effect jsonb; result jsonb;
BEGIN
  SELECT value INTO effect FROM jsonb_array_elements(p_selected.groups) WHERE (value->>'row_index')::integer=p_row_index;
  result := jsonb_build_object('status','no_effect','row_index',p_row_index,'operation_id',effect->'operation_id',
    'receipt_id',effect->'receipt_id','code',p_code,'message',p_message);
  IF p_changes IS NOT NULL THEN result := result || jsonb_build_object('changes',p_changes); END IF;
  RETURN track_private.stock_review_record_outcome(p_selected.id,p_row_index,result);
END $$;

CREATE FUNCTION public.execute_ai_stock_selection_row(p_job_id uuid,p_approval_id uuid,p_row_index integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job public.ai_jobs; selected public.ai_stock_review_selections; effect jsonb; snapshot jsonb; result jsonb;
  latest integer; product_id uuid; average_cost numeric; actor public.users; business_message text;
BEGIN
  job := track_private.stock_review_job(p_job_id,false,true);
  SELECT * INTO selected FROM public.ai_stock_review_selections WHERE job_id=job.id AND approval_id=p_approval_id FOR UPDATE;
  IF selected.id IS NULL OR p_row_index IS NULL OR NOT(p_row_index=ANY(selected.row_indices)) THEN
    RAISE EXCEPTION 'STOCK_REVIEW_NOT_FOUND: Approved operation not found';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(job.id::text || ':' || p_row_index::text,0));
  IF selected.outcomes ? p_row_index::text THEN RETURN selected.outcomes->p_row_index::text; END IF;
  result := track_private.stock_review_completed(selected,p_row_index);
  IF result IS NOT NULL THEN RETURN track_private.stock_review_record_outcome(selected.id,p_row_index,result); END IF;
  SELECT max(revision) INTO latest FROM public.ai_stock_review_revisions WHERE job_id=job.id;
  IF latest<>selected.revision OR job.review_closed_at IS NOT NULL THEN
    RETURN track_private.stock_review_no_effect(selected,p_row_index,'STALE_REVISION','The review changed. Review and approve this row again.');
  END IF;
  IF clock_timestamp()>=selected.expires_at THEN
    RETURN track_private.stock_review_no_effect(selected,p_row_index,'APPROVAL_EXPIRED','This approval expired before stock was applied. Prepare a fresh review.');
  END IF;
  -- Permission failures remain errors, never inferred no-effect outcomes.
  actor := track_private.stock_review_actor(true);
  SELECT value INTO effect FROM jsonb_array_elements(selected.groups) WHERE (value->>'row_index')::integer=p_row_index;
  BEGIN
    snapshot := track_private.stock_review_group(job,selected.rows->p_row_index::text,selected.id);
  EXCEPTION WHEN raise_exception THEN
    IF EXISTS(SELECT 1 FROM public.ai_stock_receipts WHERE job_id=job.id AND row_index=p_row_index) THEN RAISE; END IF;
    RETURN track_private.stock_review_no_effect(selected,p_row_index,'STALE_DEPENDENCIES','A reviewed product or location is no longer ready. Review it again.');
  END;
  IF snapshot->'dependencies' IS DISTINCT FROM selected.dependencies->p_row_index::text
    OR snapshot->'group' IS DISTINCT FROM effect THEN
    RETURN track_private.stock_review_no_effect(selected,p_row_index,'STALE_DEPENDENCIES','Stock, product, cost or location changed. Review the current facts.',
      jsonb_build_array(jsonb_build_object('field','dependencies','reviewed',selected.dependencies->p_row_index::text,'current',snapshot->'dependencies')));
  END IF;
  -- Check a fresh wall clock after every potentially blocking business lock.
  IF clock_timestamp()>=selected.expires_at THEN
    RETURN track_private.stock_review_no_effect(selected,p_row_index,'APPROVAL_EXPIRED','This approval expired while waiting. Prepare a fresh review.');
  END IF;
  actor := track_private.stock_review_actor(true);
  BEGIN
    IF effect->>'mode'='new' THEN
      product_id := track_private.apply_ai_new_product_receipt_base(job.id,p_row_index,
        selected.rows->p_row_index::text->>'name',selected.rows->p_row_index::text->>'sku',effect->>'stock_unit',
        (effect->>'selling_price_minor')::numeric/100,(effect->>'warehouse_id')::uuid,(effect->>'quantity')::integer,(effect->>'unit_cost_minor')::numeric/100);
      SELECT r.average_cost INTO average_cost FROM public.ai_stock_receipts r WHERE r.job_id=job.id AND r.row_index=p_row_index;
    ELSE
      product_id := (effect->>'product_id')::uuid;
      average_cost := track_private.apply_ai_stock_receipt_base(job.id,p_row_index,product_id,
        (effect->>'warehouse_id')::uuid,(effect->>'quantity')::integer,(effect->>'unit_cost_minor')::numeric/100);
    END IF;
    -- No statement following this check may wait for unrelated business locks.
    -- Audit/ledger locks are acquired by the domain write; expiry here rolls the
    -- entire group back before a terminal no-effect result is recorded outside.
    IF clock_timestamp()>=selected.expires_at THEN RAISE EXCEPTION 'STOCK_APPROVAL_EXPIRED_DURING_EXECUTION'; END IF;
    actor := track_private.stock_review_actor(true);
    UPDATE public.ai_stock_receipts SET review_revision=selected.revision,approval_id=selected.approval_id,
      operation_id=(effect->>'operation_id')::uuid,review_digest=selected.review_digest WHERE job_id=job.id AND row_index=p_row_index;
  EXCEPTION WHEN raise_exception OR check_violation OR unique_violation OR numeric_value_out_of_range THEN
    GET STACKED DIAGNOSTICS business_message=MESSAGE_TEXT;
    -- The subtransaction has rolled back both product and receipt. Check the
    -- authoritative ledger under the original job lock before claiming no effect.
    IF EXISTS(SELECT 1 FROM public.ai_stock_receipts WHERE job_id=job.id AND row_index=p_row_index) THEN RAISE; END IF;
    IF business_message='STOCK_APPROVAL_EXPIRED_DURING_EXECUTION' THEN
      RETURN track_private.stock_review_no_effect(selected,p_row_index,'APPROVAL_EXPIRED','Approval expired before the group completed. Stock was not applied.');
    END IF;
    RETURN track_private.stock_review_no_effect(selected,p_row_index,'BUSINESS_RULE_REJECTED','The business operation rejected this group. Review current stock, product details and plan limits.');
  END;
  result := jsonb_build_object('status','completed','row_index',p_row_index,'operation_id',effect->'operation_id',
    'receipt_id',effect->'receipt_id','product_id',product_id,'average_cost',average_cost);
  RETURN track_private.stock_review_record_outcome(selected.id,p_row_index,result);
END $$;

-- Called only after the job is locked; an old in-flight execution must finish
-- before absence/expiry can be turned into an authoritative terminal outcome.
CREATE FUNCTION track_private.stock_review_finalize(p_job public.ai_jobs) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE selected public.ai_stock_review_selections; row_index integer; result jsonb; latest integer;
BEGIN
  SELECT max(revision) INTO latest FROM public.ai_stock_review_revisions WHERE job_id=p_job.id;
  FOR selected IN SELECT * FROM public.ai_stock_review_selections WHERE job_id=p_job.id AND approval_id IS NOT NULL ORDER BY created_at,id FOR UPDATE LOOP
    FOREACH row_index IN ARRAY selected.row_indices LOOP
      IF selected.outcomes ? row_index::text THEN CONTINUE; END IF;
      result := track_private.stock_review_completed(selected,row_index);
      IF result IS NOT NULL THEN PERFORM track_private.stock_review_record_outcome(selected.id,row_index,result);
      ELSIF latest<>selected.revision OR p_job.review_closed_at IS NOT NULL THEN
        PERFORM track_private.stock_review_no_effect(selected,row_index,'STALE_REVISION','The saved review changed before this operation was applied.');
      ELSIF clock_timestamp()>=selected.expires_at THEN
        PERFORM track_private.stock_review_no_effect(selected,row_index,'APPROVAL_EXPIRED','Approval expired before this operation was applied.');
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION public.get_ai_stock_review(p_job_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; job public.ai_jobs; reviewed public.ai_stock_review_revisions; receipts jsonb; operations jsonb;
BEGIN
  actor := track_private.stock_review_actor(false);
  IF p_job_id IS NULL THEN
    SELECT * INTO job FROM public.ai_jobs j WHERE organization_id=actor.organization_id AND user_id=actor.id
      AND kind='inventory' AND status='ready' AND review_closed_at IS NULL
      AND source_metadata->>'purpose' IS DISTINCT FROM 'po_compare'
      AND (source_metadata->>'purpose'='stock_intake' OR EXISTS(SELECT 1 FROM public.ai_stock_review_revisions WHERE job_id=j.id))
      ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
    IF job.id IS NULL THEN RETURN NULL; END IF;
  ELSE
    job := track_private.stock_review_job(p_job_id,false,true);
  END IF;
  PERFORM track_private.stock_review_finalize(job);
  SELECT * INTO reviewed FROM public.ai_stock_review_revisions WHERE job_id=job.id ORDER BY revision DESC LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('row_index',row_index,'product_id',product_id,'warehouse_id',warehouse_id,
    'quantity',quantity,'unit_cost',unit_cost,'average_cost',average_cost,'created_product',created_product,'approved_product',approved_product) ORDER BY row_index),'[]')
    INTO receipts FROM public.ai_stock_receipts WHERE job_id=job.id AND organization_id=actor.organization_id AND approved_by=actor.id;
  -- Consumers use the last entry for the same row/revision, while retaining
  -- every exact selection for lost-response recovery.
  SELECT COALESCE(jsonb_agg(item ORDER BY row_index,approved_at,created_at,selection_id),'[]') INTO operations FROM (
    SELECT idx AS row_index,s.approved_at,s.created_at,s.id AS selection_id,jsonb_build_object('approval_id',s.approval_id,'selection_id',s.id,'revision',s.revision,
      'row_index',idx,'operation_id',g.value->'operation_id','receipt_id',g.value->'receipt_id','review_digest',s.review_digest,
      'expires_at',s.expires_at,'row',s.rows->idx::text,'status',COALESCE(s.outcomes->idx::text->>'status','approved'),
      'result',s.outcomes->idx::text) AS item
    FROM public.ai_stock_review_selections s CROSS JOIN LATERAL unnest(s.row_indices) idx
      CROSS JOIN LATERAL jsonb_array_elements(s.groups) g
    WHERE s.job_id=job.id AND s.approval_id IS NOT NULL AND (g.value->>'row_index')::integer=idx
  ) history;
  RETURN jsonb_build_object('job',job.id,'rows',COALESCE(job.result->'rows','[]'),'receipts',receipts,
    'review',CASE WHEN reviewed.revision IS NULL THEN NULL ELSE jsonb_build_object('revision',reviewed.revision,'rows',reviewed.rows) END,
    'source',jsonb_build_object('kind',COALESCE(job.source_kind,'legacy'),'hash',job.source_hash,'byte_length',job.source_byte_length,
      'text',job.source_text,'evidence_available',job.source_text IS NOT NULL),'operations',operations);
END $$;

CREATE FUNCTION public.close_ai_stock_review(p_job_id uuid,p_expected_revision integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job public.ai_jobs; latest integer;
BEGIN
  job := track_private.stock_review_job(p_job_id,false,true);
  SELECT max(revision) INTO latest FROM public.ai_stock_review_revisions WHERE job_id=job.id;
  IF latest IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT: Reload the review before closing'; END IF;
  PERFORM track_private.stock_review_finalize(job);
  IF EXISTS(SELECT 1 FROM public.ai_stock_review_selections s CROSS JOIN LATERAL unnest(s.row_indices) idx
    WHERE s.job_id=job.id AND s.approval_id IS NOT NULL AND NOT(s.outcomes ? idx::text)) THEN
    RAISE EXCEPTION 'UNRESOLVED_OPERATIONS: Check or conclusively resolve approved receipts before closing';
  END IF;
  UPDATE public.ai_jobs SET review_closed_at=COALESCE(review_closed_at,clock_timestamp()) WHERE id=job.id;
END $$;

-- Definer functions are intentionally narrow: explicit permissions, fixed
-- search_path, current actor checks. Private domain bases are not Data API tools.
REVOKE ALL ON public.ai_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_jobs TO authenticated;
DROP POLICY IF EXISTS ai_read ON public.ai_jobs;
CREATE POLICY ai_read ON public.ai_jobs FOR SELECT TO authenticated USING (
  user_id=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=(SELECT auth.uid())
    AND u.organization_id=ai_jobs.organization_id AND u.role='business_owner' AND u.status='active'));
CREATE FUNCTION public.preview_ai_stock_selection(p_job_id uuid,p_revision integer,p_row_indices integer[],p_physical_received boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job public.ai_jobs; reviewed public.ai_stock_review_revisions; selected integer[]; selected_row_index integer;
  selection_id uuid := gen_random_uuid(); snapshot jsonb; groups jsonb := '[]'; dependencies jsonb := '{}'; rows jsonb := '{}';
  expires timestamptz; digest text; ttl text;
BEGIN
  job := track_private.stock_review_job(p_job_id,true);
  SELECT * INTO reviewed FROM public.ai_stock_review_revisions WHERE job_id=job.id ORDER BY revision DESC LIMIT 1;
  IF reviewed.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'REVISION_CONFLICT: Reload the saved review'; END IF;
  IF p_physical_received IS DISTINCT FROM true OR cardinality(p_row_indices) IS NULL OR cardinality(p_row_indices)<1
    OR EXISTS(SELECT 1 FROM unnest(p_row_indices) v WHERE v IS NULL OR v<0 OR v>=jsonb_array_length(reviewed.rows))
    OR cardinality(p_row_indices)<>(SELECT count(DISTINCT v) FROM unnest(p_row_indices) v) THEN
    RAISE EXCEPTION 'REVIEW_NOT_READY: Select exact source rows and confirm the goods arrived';
  END IF;
  SELECT array_agg(v ORDER BY v) INTO selected FROM unnest(p_row_indices) v;
  SELECT settings->>'ai_stock_review_ttl_seconds' INTO ttl FROM public.organizations WHERE id=job.organization_id;
  IF ttl IS NULL OR ttl !~ '^\d{1,4}$' OR ttl::integer NOT BETWEEN 60 AND 3600 THEN
    RAISE EXCEPTION 'APPROVAL_POLICY_NOT_CONFIGURED: Configure an approved review expiry before applying stock';
  END IF;
  FOREACH selected_row_index IN ARRAY selected LOOP
    IF EXISTS(SELECT 1 FROM public.ai_stock_receipts receipt WHERE receipt.job_id=job.id AND receipt.row_index=selected_row_index) THEN
      RAISE EXCEPTION 'ALREADY_COMPLETED: This source row already has a receipt';
    END IF;
    IF reviewed.rows->selected_row_index->>'mode'='existing' AND EXISTS(
      SELECT 1 FROM jsonb_array_elements(reviewed.rows) r WHERE r->>'mode'='existing'
        AND r->>'product_id'=reviewed.rows->selected_row_index->>'product_id' AND (r->>'row_index')::integer<>selected_row_index) THEN
      RAISE EXCEPTION 'DUPLICATE_PRODUCT_ROWS: Clarify repeated product lines before receiving';
    END IF;
    IF reviewed.rows->selected_row_index->>'mode'='existing' AND EXISTS(SELECT 1 FROM public.ai_stock_receipts receipt
      WHERE receipt.job_id=job.id AND receipt.product_id=(reviewed.rows->selected_row_index->>'product_id')::uuid) THEN
      RAISE EXCEPTION 'DUPLICATE_PRODUCT_ROWS: This product was already received from another source row';
    END IF;
    snapshot := track_private.stock_review_group(job,reviewed.rows->selected_row_index,selection_id);
    groups := groups || jsonb_build_array(snapshot->'group');
    dependencies := dependencies || jsonb_build_object(selected_row_index::text,snapshot->'dependencies');
    rows := rows || jsonb_build_object(selected_row_index::text,reviewed.rows->selected_row_index);
  END LOOP;
  expires := clock_timestamp()+make_interval(secs=>ttl::integer);
  digest := encode(sha256(convert_to(jsonb_build_object('policy',1,'job',job.id,'organization',job.organization_id,
    'owner',job.user_id,'selection',selection_id,'revision',reviewed.revision,'source_hash',job.source_hash,
    'expires_at',expires,'rows',rows,'groups',groups,'dependencies',dependencies)::text,'UTF8')),'hex');
  INSERT INTO public.ai_stock_review_selections(id,job_id,revision,organization_id,owner_id,row_indices,rows,groups,dependencies,review_digest,expires_at)
    VALUES(selection_id,job.id,reviewed.revision,job.organization_id,job.user_id,selected,rows,groups,dependencies,digest,expires);
  RETURN jsonb_build_object('selection_id',selection_id,'revision',reviewed.revision,'review_digest',digest,'expires_at',expires,'groups',groups);
END $$;

CREATE FUNCTION public.approve_ai_stock_selection(p_job_id uuid,p_selection_id uuid,p_revision integer,p_review_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job public.ai_jobs; selected public.ai_stock_review_selections; latest integer;
BEGIN
  job := track_private.stock_review_job(p_job_id,true);
  SELECT * INTO selected FROM public.ai_stock_review_selections WHERE id=p_selection_id AND job_id=job.id FOR UPDATE;
  IF selected.id IS NULL THEN RAISE EXCEPTION 'STOCK_REVIEW_NOT_FOUND: Selection not found'; END IF;
  IF selected.revision IS DISTINCT FROM p_revision OR selected.review_digest IS DISTINCT FROM p_review_digest THEN
    RAISE EXCEPTION 'SELECTION_MISMATCH: Review the exact server selection';
  END IF;
  SELECT max(revision) INTO latest FROM public.ai_stock_review_revisions WHERE job_id=job.id;
  IF latest<>selected.revision THEN RAISE EXCEPTION 'REVISION_CONFLICT: Review changed before approval'; END IF;
  IF clock_timestamp()>=selected.expires_at THEN RAISE EXCEPTION 'APPROVAL_EXPIRED: Prepare a fresh review'; END IF;
  IF selected.approval_id IS NULL THEN
    UPDATE public.ai_stock_review_selections SET approval_id=gen_random_uuid(),approved_by=job.user_id,approved_at=clock_timestamp()
      WHERE id=selected.id RETURNING * INTO selected;
    INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values,correlation_id)
      VALUES(job.organization_id,job.user_id,'AI_APPROVAL','ai_stock_review_selections',selected.id,
        jsonb_build_object('approval_id',selected.approval_id,'revision',selected.revision,'row_indices',selected.row_indices,'review_digest',selected.review_digest),job.id);
  END IF;
  RETURN jsonb_build_object('approval_id',selected.approval_id,'selection_id',selected.id,'revision',selected.revision,
    'review_digest',selected.review_digest,'row_indices',selected.row_indices,'approved_at',selected.approved_at,'expires_at',selected.expires_at);
END $$;

DO $$
DECLARE function_row record;
BEGIN
  FOR function_row IN SELECT p.oid::regprocedure AS signature,n.nspname AS schema_name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='track_private' AND (p.proname LIKE 'stock_review_%' OR p.proname IN
      ('guard_stock_selection','guard_stock_source','audit_stock_ai_job','apply_ai_stock_receipt_base','apply_ai_new_product_receipt_base')))
      OR (n.nspname='public' AND p.proname IN ('attach_ai_stock_source','save_ai_stock_review','preview_ai_stock_selection',
        'approve_ai_stock_selection','execute_ai_stock_selection_row','get_ai_stock_review','close_ai_stock_review',
        'apply_ai_stock_receipt','apply_ai_new_product_receipt')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',function_row.signature);
    IF function_row.schema_name='public' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',function_row.signature);
    END IF;
  END LOOP;
END $$;
COMMIT;
