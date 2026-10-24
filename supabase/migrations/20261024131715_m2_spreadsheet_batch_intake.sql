BEGIN;
ALTER TABLE track_private.stock_command_settings ADD COLUMN batch_intake_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.stock_intake_batches (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id), created_by uuid NOT NULL REFERENCES public.users(id),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), mode text NOT NULL CHECK(mode IN('opening_stock','additional_delivery')),
 warehouse_id uuid NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','processing','review','posting','completed','partial','cancelled')),
 approval_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), FOREIGN KEY(organization_id,warehouse_id) REFERENCES public.warehouses(organization_id,id)
);
CREATE INDEX stock_batches_recent ON public.stock_intake_batches(organization_id,created_at DESC,id);
CREATE TABLE public.stock_intake_sources (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, batch_id uuid NOT NULL, created_by uuid NOT NULL REFERENCES public.users(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 255), bytes bigint NOT NULL CHECK(bytes BETWEEN 1 AND 20971520),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), object_key text NOT NULL UNIQUE, version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'uploading' CHECK(status IN('uploading','queued','inspecting','select_sheets','parsing','prepared','failed')),
 inspection jsonb, plan jsonb, stats jsonb, error text, excluded boolean NOT NULL DEFAULT false,
 duplicate_reason text NOT NULL DEFAULT '', verified_at timestamptz, upload_expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours', created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(batch_id,id), FOREIGN KEY(organization_id,batch_id) REFERENCES public.stock_intake_batches(organization_id,id)
);
CREATE INDEX stock_sources_batch ON public.stock_intake_sources(batch_id,id);
CREATE INDEX stock_sources_hash ON public.stock_intake_sources(organization_id,sha256);
CREATE TABLE public.stock_intake_batch_drafts (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, batch_id uuid NOT NULL, document jsonb NOT NULL,
 UNIQUE(batch_id,id), FOREIGN KEY(organization_id,batch_id) REFERENCES public.stock_intake_batches(organization_id,id)
);
CREATE TABLE public.stock_intake_groups (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, batch_id uuid NOT NULL, label text NOT NULL,
 warehouse_id uuid NOT NULL, supplier text NOT NULL DEFAULT '', invoice_reference text NOT NULL DEFAULT '', duplicate_reason text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'review' CHECK(status IN('review','preparing','ready','posting','posted','needs_review')),
 excluded boolean NOT NULL DEFAULT false, receipt_id uuid REFERENCES public.stock_intakes(id), prepared_hash text, error text,
 UNIQUE(batch_id,id), FOREIGN KEY(organization_id,batch_id) REFERENCES public.stock_intake_batches(organization_id,id),
 FOREIGN KEY(organization_id,warehouse_id) REFERENCES public.warehouses(organization_id,id)
);
CREATE INDEX stock_groups_batch ON public.stock_intake_groups(batch_id,id);
ALTER TABLE public.stock_intakes ADD COLUMN batch_id uuid REFERENCES public.stock_intake_batches(id);
ALTER TABLE public.stock_intakes ADD CONSTRAINT stock_intakes_batch_tenant_fk FOREIGN KEY(organization_id,batch_id) REFERENCES public.stock_intake_batches(organization_id,id);
ALTER TABLE public.stock_intake_groups ADD CONSTRAINT stock_groups_receipt_tenant_fk FOREIGN KEY(organization_id,receipt_id) REFERENCES public.stock_intakes(organization_id,id);
CREATE TABLE public.stock_intake_batch_rows (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, batch_id uuid NOT NULL, source_id uuid NOT NULL, version integer NOT NULL,
 sheet text NOT NULL CHECK(length(sheet) BETWEEN 1 AND 255), row_number integer NOT NULL CHECK(row_number>0), raw jsonb NOT NULL,
 review jsonb NOT NULL, draft_id uuid, group_id uuid NOT NULL, excluded boolean NOT NULL DEFAULT false, warnings jsonb NOT NULL DEFAULT '[]', issues text[] NOT NULL DEFAULT '{}',
 UNIQUE(source_id,sheet,row_number), FOREIGN KEY(organization_id,source_id) REFERENCES public.stock_intake_sources(organization_id,id),
 FOREIGN KEY(batch_id,source_id) REFERENCES public.stock_intake_sources(batch_id,id),
 FOREIGN KEY(batch_id,group_id) REFERENCES public.stock_intake_groups(batch_id,id),
 FOREIGN KEY(batch_id,draft_id) REFERENCES public.stock_intake_batch_drafts(batch_id,id)
);
CREATE INDEX stock_batch_rows_page ON public.stock_intake_batch_rows(batch_id,source_id,sheet,row_number,id);
CREATE INDEX stock_batch_rows_group ON public.stock_intake_batch_rows(group_id,id);
CREATE INDEX stock_batch_rows_draft ON public.stock_intake_batch_rows(draft_id) WHERE draft_id IS NOT NULL;
CREATE INDEX stock_batch_rows_issues ON public.stock_intake_batch_rows USING gin(issues);
CREATE TABLE public.stock_intake_batch_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL, batch_id uuid NOT NULL,
 actor_id uuid REFERENCES public.users(id), kind text NOT NULL, affected jsonb NOT NULL, before_value jsonb, after_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(organization_id,batch_id) REFERENCES public.stock_intake_batches(organization_id,id)
);
CREATE TABLE public.stock_intake_batch_approvals (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL, batch_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES public.users(id),
 revision integer NOT NULL, manifest jsonb NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,batch_id) REFERENCES public.stock_intake_batches(organization_id,id)
);
CREATE TABLE public.stock_intake_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, batch_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES public.users(id),
 stage text NOT NULL CHECK(stage IN('inspect','parse','prepare','post')), source_id uuid REFERENCES public.stock_intake_sources(id), group_id uuid REFERENCES public.stock_intake_groups(id),
 content_revision integer NOT NULL, job_key text NOT NULL UNIQUE,
 approval_id uuid REFERENCES public.stock_intake_batch_approvals(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','done','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3), processing_version integer NOT NULL DEFAULT 0,
 lease_token uuid, lease_until timestamptz, worker_id text, run_after timestamptz NOT NULL DEFAULT now(),
 result jsonb, error text, permanent boolean NOT NULL DEFAULT false, attempt_log jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,batch_id) REFERENCES public.stock_intake_batches(organization_id,id),
 FOREIGN KEY(batch_id,source_id) REFERENCES public.stock_intake_sources(batch_id,id),
 FOREIGN KEY(batch_id,group_id) REFERENCES public.stock_intake_groups(batch_id,id),
 CHECK((stage IN('inspect','parse') AND source_id IS NOT NULL AND group_id IS NULL) OR (stage IN('prepare','post') AND group_id IS NOT NULL AND source_id IS NULL))
);
CREATE INDEX stock_jobs_claim ON public.stock_intake_jobs(run_after,id) WHERE status IN('queued','running');
CREATE INDEX stock_jobs_batch ON public.stock_intake_jobs(batch_id,status);
CREATE INDEX stock_jobs_leases ON public.stock_intake_jobs(organization_id,lease_until) WHERE status='running';
CREATE INDEX stock_products_intake_name ON public.products(organization_id,lower(btrim(name))) WHERE status='active';
CREATE INDEX stock_products_intake_barcode ON public.products(organization_id,barcode) WHERE barcode IS NOT NULL;

CREATE TABLE track_private.stock_intake_batch_context (
 backend integer NOT NULL, transaction_id bigint NOT NULL, batch_id uuid NOT NULL, group_id uuid NOT NULL,
 PRIMARY KEY(backend,transaction_id)
);
ALTER TABLE track_private.stock_intake_batch_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON track_private.stock_intake_batch_context FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION track_private.stock_batch_freeze() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Stock intake approval and correction history is immutable'; END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_freeze() FROM PUBLIC;
CREATE TRIGGER stock_batch_approval_immutable BEFORE UPDATE OR DELETE ON public.stock_intake_batch_approvals FOR EACH ROW EXECUTE FUNCTION track_private.stock_batch_freeze();
CREATE TRIGGER stock_batch_changes_immutable BEFORE UPDATE OR DELETE ON public.stock_intake_batch_changes FOR EACH ROW EXECUTE FUNCTION track_private.stock_batch_freeze();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['stock_intake_batches','stock_intake_sources','stock_intake_groups','stock_intake_batch_rows','stock_intake_batch_drafts','stock_intake_batch_changes','stock_intake_batch_approvals','stock_intake_jobs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY stock_batch_manager_read ON public.%I FOR SELECT TO authenticated USING (organization_id=(SELECT public.get_user_org_id()) AND (SELECT public.is_admin_or_above()))',t);
 END LOOP;
END $$;

CREATE FUNCTION track_private.stock_batch_actor(writing boolean DEFAULT true) RETURNS public.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active' AND role IN('business_owner','admin') AND organization_id IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF writing THEN
  PERFORM track_private.assert_active_transaction_access(actor.organization_id);
  IF NOT (SELECT batch_intake_enabled FROM track_private.stock_command_settings WHERE singleton) THEN RAISE EXCEPTION 'Spreadsheet intake is disabled'; END IF;
 END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_actor(boolean) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_key(value text) RETURNS uuid
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT substr(encode(public.digest(value,'sha256'),'hex'),1,32)::uuid $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_key(text) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_issues(line jsonb) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE issues text[]:='{}'; draft jsonb:=line->'new_product'; qty numeric; conversion numeric; cost numeric;
BEGIN
 IF NULLIF(line->>'product_id','') IS NULL AND (jsonb_typeof(draft) IS DISTINCT FROM 'object' OR draft->'confirmed' IS DISTINCT FROM 'true'::jsonb
  OR length(btrim(COALESCE(draft->>'name',''))) NOT BETWEEN 1 AND 255 OR length(btrim(COALESCE(draft->>'sku',''))) NOT BETWEEN 1 AND 100
  OR jsonb_typeof(draft->'cost_price') IS DISTINCT FROM 'number' OR jsonb_typeof(draft->'selling_price') IS DISTINCT FROM 'number') THEN issues:=issues||'products'::text;
 ELSIF NULLIF(line->>'product_id','') IS NULL AND (
  (draft->>'cost_price')::numeric NOT BETWEEN 0 AND 9999999999.99 OR (draft->>'selling_price')::numeric NOT BETWEEN 0 AND 9999999999.99
  OR (draft->>'cost_price')::numeric<>round((draft->>'cost_price')::numeric,2) OR (draft->>'selling_price')::numeric<>round((draft->>'selling_price')::numeric,2)) THEN issues:=issues||'products'::text; END IF;
 IF jsonb_typeof(line->'quantity')='number' AND line->>'quantity' ~ '^[1-9][0-9]{0,9}$' THEN qty:=(line->>'quantity')::numeric; END IF;
 IF qty IS NULL OR qty>2147483647 THEN issues:=issues||'quantities'::text; END IF;
 IF jsonb_typeof(line->'conversion')='number' AND line->>'conversion' ~ '^[1-9][0-9]{0,9}$' THEN conversion:=(line->>'conversion')::numeric; END IF;
 IF conversion IS NULL OR conversion>2147483647 OR qty*conversion>2147483647 OR line->'conversion_confirmed' IS DISTINCT FROM 'true'::jsonb
  OR length(btrim(COALESCE(line->>'purchase_unit',''))) NOT BETWEEN 1 AND 40 THEN issues:=issues||'conversions'::text; END IF;
 IF jsonb_typeof(line->'receipt_unit_cost')='number' THEN cost:=(line->>'receipt_unit_cost')::numeric; END IF;
 IF cost IS NULL OR cost<0 OR cost>9999999999.99 OR cost<>round(cost,2) THEN issues:=issues||'costs'::text; END IF;
 RETURN issues;
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_issues(jsonb) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_context(target_receipt uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM track_private.stock_intake_batch_context c
  JOIN public.stock_intake_groups g ON g.id=c.group_id AND g.batch_id=c.batch_id
  WHERE c.backend=pg_backend_pid() AND c.transaction_id=txid_current() AND (target_receipt IS NULL OR g.receipt_id=target_receipt))
$$;
REVOKE ALL ON FUNCTION track_private.stock_batch_context(uuid) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_invalidate(target_batch uuid, groups uuid[]) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE id=ANY(groups) AND batch_id=target_batch AND status='posted') THEN RAISE EXCEPTION 'Posted receipts are immutable'; END IF;
 UPDATE public.stock_intake_jobs SET status='cancelled',lease_until=NULL WHERE batch_id=target_batch AND (stage='post' OR (stage='prepare' AND group_id=ANY(groups))) AND status IN('queued','running');
 UPDATE public.stock_intakes SET status='draft',approval_id=NULL WHERE batch_id=target_batch AND status<>'posted';
 UPDATE public.stock_intake_groups SET status='review',prepared_hash=NULL,error=NULL,revision=revision+1 WHERE batch_id=target_batch AND id=ANY(groups);
 UPDATE public.stock_intake_batches SET approval_id=NULL,status='review',revision=revision+1,updated_at=now() WHERE id=target_batch;
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_invalidate(uuid,uuid[]) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_enqueue(target_batch uuid, target_actor uuid, kind text, target_source uuid, target_group uuid, version integer, target_approval uuid DEFAULT NULL) RETURNS void
LANGUAGE sql SET search_path='' AS $$
 INSERT INTO public.stock_intake_jobs(organization_id,batch_id,actor_id,stage,source_id,group_id,content_revision,approval_id,job_key)
 SELECT b.organization_id,b.id,target_actor,kind,target_source,target_group,version,target_approval,b.id::text||':'||kind||':'||COALESCE(target_source,target_group)::text||':'||version||':'||COALESCE(target_approval::text,'')
 FROM public.stock_intake_batches b WHERE b.id=target_batch
 ON CONFLICT(job_key) DO UPDATE SET status=CASE WHEN stock_intake_jobs.status IN('cancelled','failed') THEN 'queued' ELSE stock_intake_jobs.status END,
  attempts=CASE WHEN stock_intake_jobs.status IN('cancelled','failed') THEN 0 ELSE stock_intake_jobs.attempts END,run_after=now(),error=NULL,permanent=false,
  actor_id=CASE WHEN stock_intake_jobs.stage<>'post' AND stock_intake_jobs.status IN('queued','cancelled','failed') THEN EXCLUDED.actor_id ELSE stock_intake_jobs.actor_id END
$$;
REVOKE ALL ON FUNCTION track_private.stock_batch_enqueue(uuid,uuid,text,uuid,uuid,integer,uuid) FROM PUBLIC;

-- Storage objects remain private and immutable. Provision the bucket through
-- the Storage API; migrations never create or manipulate object metadata.
DO $$ BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
  EXECUTE $policy$ CREATE POLICY stock_intake_private_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (
   bucket_id='stock-intake-originals' AND EXISTS(SELECT 1 FROM public.stock_intake_sources s JOIN public.stock_intake_batches b ON b.id=s.batch_id
    WHERE s.object_key=objects.name AND s.created_by=auth.uid() AND s.status='uploading' AND s.upload_expires_at>clock_timestamp() AND NOT s.excluded AND b.status<>'cancelled'
     AND s.organization_id=public.get_user_org_id() AND public.is_admin_or_above())) $policy$;
  EXECUTE $policy$ CREATE POLICY stock_intake_private_read ON storage.objects FOR SELECT TO authenticated USING (
   bucket_id='stock-intake-originals' AND EXISTS(SELECT 1 FROM public.stock_intake_sources s WHERE s.object_key=objects.name
    AND s.organization_id=public.get_user_org_id() AND public.is_admin_or_above())) $policy$;
  -- Restrictive bucket fences also apply if a project has an older, broad
  -- permissive object policy. Other buckets keep their existing behavior.
  EXECUTE $policy$ CREATE POLICY stock_intake_anon_fence ON storage.objects AS RESTRICTIVE FOR ALL TO anon
   USING (bucket_id<>'stock-intake-originals') WITH CHECK (bucket_id<>'stock-intake-originals') $policy$;
  EXECUTE $policy$ CREATE POLICY stock_intake_read_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (
   bucket_id<>'stock-intake-originals' OR EXISTS(SELECT 1 FROM public.stock_intake_sources s WHERE s.object_key=objects.name
    AND s.organization_id=public.get_user_org_id() AND public.is_admin_or_above())) $policy$;
  EXECUTE $policy$ CREATE POLICY stock_intake_upload_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
   bucket_id<>'stock-intake-originals' OR EXISTS(SELECT 1 FROM public.stock_intake_sources s JOIN public.stock_intake_batches b ON b.id=s.batch_id
    WHERE s.object_key=objects.name AND s.created_by=auth.uid() AND s.status='uploading' AND s.upload_expires_at>clock_timestamp() AND NOT s.excluded AND b.status<>'cancelled'
     AND s.organization_id=public.get_user_org_id() AND public.is_admin_or_above())) $policy$;
  EXECUTE $policy$ CREATE POLICY stock_intake_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
   USING (bucket_id<>'stock-intake-originals') WITH CHECK (bucket_id<>'stock-intake-originals') $policy$;
  EXECUTE $policy$ CREATE POLICY stock_intake_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
   USING (bucket_id<>'stock-intake-originals') $policy$;
 END IF;
END $$;

-- Additional command and worker functions follow in this same atomic migration.
CREATE FUNCTION track_private.stock_batch_refresh(target uuid) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.stock_intake_batches b SET status=CASE
  WHEN EXISTS(SELECT 1 FROM public.stock_intake_jobs WHERE batch_id=target AND stage='post' AND status IN('queued','running')) THEN 'posting'
  WHEN EXISTS(SELECT 1 FROM public.stock_intake_jobs WHERE batch_id=target AND stage<>'post' AND status IN('queued','running')) THEN 'processing'
  WHEN EXISTS(SELECT 1 FROM public.stock_intake_sources WHERE batch_id=target AND NOT excluded AND status<>'prepared') THEN
   CASE WHEN EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE batch_id=target AND status='posted') THEN 'partial' ELSE 'review' END
  WHEN EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE batch_id=target AND status='posted') THEN
   CASE WHEN EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE batch_id=target AND status<>'posted' AND NOT excluded) THEN 'partial' ELSE 'completed' END
  ELSE 'review' END,updated_at=now() WHERE b.id=target AND b.status<>'cancelled';
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_refresh(uuid) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_row_review(target public.stock_intake_batch_rows) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT target.review||jsonb_build_object('id',target.id,'new_product',
  CASE WHEN target.draft_id IS NULL THEN NULL ELSE (SELECT document FROM public.stock_intake_batch_drafts WHERE id=target.draft_id AND batch_id=target.batch_id) END)
$$;
REVOKE ALL ON FUNCTION track_private.stock_batch_row_review(public.stock_intake_batch_rows) FROM PUBLIC;

CREATE FUNCTION public.read_stock_intake_batch(target_id uuid DEFAULT NULL, row_offset integer DEFAULT 0, group_offset integer DEFAULT 0, target_source uuid DEFAULT NULL, review_only boolean DEFAULT false, issue_filter text DEFAULT 'all', selection_kind text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; b public.stock_intake_batches; total_rows integer; total_groups integer; response jsonb;
BEGIN
 actor:=track_private.stock_batch_actor(false);
 IF row_offset NOT BETWEEN 0 AND 1000000 OR group_offset NOT BETWEEN 0 AND 1000000 THEN RAISE EXCEPTION 'Invalid page offset'; END IF;
 IF issue_filter NOT IN('all','products','quantities','conversions','costs') THEN RAISE EXCEPTION 'Invalid exception filter'; END IF;
 IF target_id IS NULL THEN
  RETURN jsonb_build_object('batches',(SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]') FROM
   (SELECT id,revision,mode,warehouse_id,status,created_at,updated_at FROM public.stock_intake_batches WHERE organization_id=actor.organization_id ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET row_offset) p));
 END IF;
 SELECT * INTO b FROM public.stock_intake_batches WHERE id=target_id AND organization_id=actor.organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch unavailable' USING ERRCODE='P0002'; END IF;
 IF selection_kind='rows' THEN
  RETURN jsonb_build_object('revision',b.revision,'ids',(SELECT COALESCE(jsonb_agg(r.id ORDER BY r.id),'[]') FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version JOIN public.stock_intake_groups g ON g.id=r.group_id
    WHERE r.batch_id=b.id AND NOT r.excluded AND NOT s.excluded AND g.status<>'posted' AND (target_source IS NULL OR s.id=target_source) AND (issue_filter='all' OR r.issues @> ARRAY[issue_filter])));
 ELSIF selection_kind='ready' THEN
  RETURN jsonb_build_object('revision',b.revision,'receipts',(SELECT COALESCE(jsonb_agg(jsonb_build_object('group_id',g.id,'hash',g.prepared_hash,'cost',i.document->>'receipt_cost_total','currency',i.document->>'currency') ORDER BY g.id),'[]')
   FROM public.stock_intake_groups g JOIN public.stock_intakes i ON i.id=g.receipt_id WHERE g.batch_id=b.id AND g.status='ready' AND NOT g.excluded));
 ELSIF selection_kind='preparable' THEN
  RETURN jsonb_build_object('revision',b.revision,'ids',(SELECT COALESCE(jsonb_agg(g.id ORDER BY g.id),'[]') FROM public.stock_intake_groups g WHERE g.batch_id=b.id AND NOT g.excluded AND g.status IN('review','needs_review')
   AND EXISTS(SELECT 1 FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version WHERE r.group_id=g.id AND NOT r.excluded AND NOT s.excluded)
   AND NOT EXISTS(SELECT 1 FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version WHERE r.group_id=g.id AND NOT r.excluded AND NOT s.excluded AND cardinality(r.issues)>0)));
 ELSIF selection_kind IS NOT NULL THEN RAISE EXCEPTION 'Invalid selection'; END IF;
 SELECT count(*) INTO total_rows FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version
  JOIN public.stock_intake_groups g ON g.id=r.group_id WHERE r.batch_id=b.id AND (target_source IS NULL OR r.source_id=target_source)
   AND (NOT review_only OR g.status IN('review','needs_review')) AND (issue_filter='all' OR (NOT r.excluded AND NOT s.excluded AND r.issues @> ARRAY[issue_filter]));
 SELECT count(*) INTO total_groups FROM public.stock_intake_groups WHERE batch_id=b.id;
 response:=jsonb_build_object('batch',to_jsonb(b),'sources',(SELECT COALESCE(jsonb_agg((to_jsonb(s)-'inspection')||jsonb_build_object('inspection',CASE WHEN s.id=target_source THEN s.inspection END,'sheet_count',jsonb_array_length(s.inspection->'sheets'),'duplicate',EXISTS(
  SELECT 1 FROM public.stock_intake_sources other WHERE other.organization_id=s.organization_id AND other.sha256=s.sha256 AND other.verified_at IS NOT NULL
   AND (other.created_at<s.created_at OR (other.created_at=s.created_at AND other.id<s.id)))) ORDER BY s.created_at,s.id),'[]') FROM public.stock_intake_sources s WHERE s.batch_id=b.id),
  'groups',(SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]') FROM (SELECT g.*,
   (SELECT count(*) FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version WHERE r.group_id=g.id AND NOT r.excluded AND NOT s.excluded) row_count,
   i.document->>'receipt_cost_total' receipt_cost_total,i.document->>'currency' prepared_currency,CASE WHEN i.result IS NOT NULL THEN jsonb_build_object('posted_at',i.result->'posted_at','line_count',jsonb_array_length(i.result->'lines')) END result
   FROM public.stock_intake_groups g LEFT JOIN public.stock_intakes i ON i.id=g.receipt_id WHERE g.batch_id=b.id ORDER BY g.label,g.id LIMIT 50 OFFSET group_offset) p),
  'rows',(SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]') FROM (SELECT r.id,r.source_id,r.sheet,r.row_number,r.raw,r.warnings,r.issues,r.group_id,r.excluded,r.draft_id,
    s.excluded source_excluded,s.name source_name,g.status group_status,track_private.stock_batch_row_review(r) review,
    (SELECT count(*) FROM public.stock_intake_batch_rows used JOIN public.stock_intake_sources origin ON origin.id=used.source_id AND origin.version=used.version WHERE used.draft_id=r.draft_id) draft_appearances
    FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version JOIN public.stock_intake_groups g ON g.id=r.group_id
    WHERE r.batch_id=b.id AND (target_source IS NULL OR r.source_id=target_source) AND (NOT review_only OR g.status IN('review','needs_review'))
     AND (issue_filter='all' OR (NOT r.excluded AND NOT s.excluded AND r.issues @> ARRAY[issue_filter])) ORDER BY s.created_at,s.id,r.sheet,r.row_number,r.id LIMIT 100 OFFSET row_offset) p),
  'row_count',total_rows,'group_count',total_groups,'next_row_offset',CASE WHEN total_rows>row_offset+100 THEN row_offset+100 END,
  'next_group_offset',CASE WHEN total_groups>group_offset+50 THEN group_offset+50 END,
  'summary',jsonb_build_object('files',(SELECT count(*) FROM public.stock_intake_sources WHERE batch_id=b.id),'bytes',(SELECT COALESCE(sum(bytes),0) FROM public.stock_intake_sources WHERE batch_id=b.id),
   'prepared_rows',(SELECT count(*) FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version WHERE r.batch_id=b.id),
   'ready',(SELECT count(*) FROM public.stock_intake_groups WHERE batch_id=b.id AND status='ready' AND NOT excluded),
   'posted',(SELECT count(*) FROM public.stock_intake_groups WHERE batch_id=b.id AND status='posted'),
   'needs_review',(SELECT count(*) FROM public.stock_intake_groups WHERE batch_id=b.id AND status IN('review','needs_review') AND NOT excluded),
   'excluded',(SELECT count(*) FROM public.stock_intake_groups WHERE batch_id=b.id AND excluded),
   'failed_sources',(SELECT count(*) FROM public.stock_intake_sources WHERE batch_id=b.id AND status='failed'),
   'jobs_active',(SELECT count(*) FROM public.stock_intake_jobs WHERE batch_id=b.id AND status IN('queued','running')),
   'currency',(SELECT currency FROM public.organizations WHERE id=b.organization_id)));
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.read_stock_intake_batch(uuid,integer,integer,uuid,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.read_stock_intake_batch(uuid,integer,integer,uuid,boolean,text,text) TO authenticated;

CREATE FUNCTION track_private.stock_batch_lease(command jsonb, check_actor boolean DEFAULT true) RETURNS public.stock_intake_jobs
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE job public.stock_intake_jobs;
BEGIN
 SELECT * INTO job FROM public.stock_intake_jobs WHERE id=(command->>'job_id')::uuid FOR UPDATE;
 IF NOT FOUND OR job.status<>'running' OR job.lease_token IS DISTINCT FROM (command->>'lease_token')::uuid
  OR job.processing_version IS DISTINCT FROM (command->>'processing_version')::integer OR job.lease_until<=clock_timestamp()
  OR EXISTS(SELECT 1 FROM public.stock_intake_batches WHERE id=job.batch_id AND status='cancelled') THEN RAISE EXCEPTION 'Job lease expired or work cancelled' USING ERRCODE='40001'; END IF;
 IF check_actor THEN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=job.actor_id AND organization_id=job.organization_id AND status='active' AND role IN('business_owner','admin')) THEN RAISE EXCEPTION 'Recorded actor is no longer authorized' USING ERRCODE='42501'; END IF;
  PERFORM track_private.assert_active_transaction_access(job.organization_id);
  IF NOT (SELECT batch_intake_enabled FROM track_private.stock_command_settings WHERE singleton) THEN RAISE EXCEPTION 'Spreadsheet intake is disabled'; END IF;
 END IF;
 IF job.source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stock_intake_sources WHERE id=job.source_id AND version=job.content_revision AND NOT excluded) THEN RAISE EXCEPTION 'Source changed; renew preparation' USING ERRCODE='40001'; END IF;
 IF job.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE id=job.group_id AND revision=job.content_revision AND NOT excluded) THEN RAISE EXCEPTION 'Receipt changed; renew preparation' USING ERRCODE='40001'; END IF;
 RETURN job;
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_lease(jsonb,boolean) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_claim(worker text) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE job public.stock_intake_jobs; selected_batch uuid;
BEGIN
 IF length(COALESCE(worker,'')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Worker identity required'; END IF;
 IF NOT (SELECT batch_intake_enabled FROM track_private.stock_command_settings WHERE singleton) THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(18024,2);
 -- All mutations lock the batch before a job/source/group, including recovery.
 FOR job IN SELECT j.* FROM public.stock_intake_jobs j JOIN public.stock_intake_batches b ON b.id=j.batch_id
  WHERE j.status='running' AND j.lease_until<=clock_timestamp() AND j.attempts>=3 FOR UPDATE OF b SKIP LOCKED LOOP
  UPDATE public.stock_intake_jobs SET status='failed',error='Worker lease expired after three attempts',permanent=false,lease_until=NULL WHERE id=job.id;
  UPDATE public.stock_intake_sources SET status='failed',error='Worker lease expired after three attempts' WHERE id=job.source_id AND version=job.content_revision;
  UPDATE public.stock_intake_groups SET status='needs_review',error='Worker lease expired after three attempts' WHERE id=job.group_id AND revision=job.content_revision AND status<>'posted';
  PERFORM track_private.stock_batch_refresh(job.batch_id);
 END LOOP;
 IF (SELECT count(*) FROM public.stock_intake_jobs WHERE status='running' AND lease_until>clock_timestamp())>=4 THEN RETURN NULL; END IF;
 SELECT b.id INTO selected_batch FROM public.stock_intake_batches b WHERE b.status<>'cancelled'
  AND (SELECT count(*) FROM public.stock_intake_jobs active WHERE active.organization_id=b.organization_id AND active.status='running' AND active.lease_until>clock_timestamp())<2
  AND EXISTS(SELECT 1 FROM public.stock_intake_jobs j WHERE j.batch_id=b.id AND j.attempts<3 AND j.run_after<=clock_timestamp() AND (j.status='queued' OR (j.status='running' AND j.lease_until<=clock_timestamp())))
  ORDER BY b.created_at,b.id FOR UPDATE OF b SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO job FROM public.stock_intake_jobs j WHERE j.batch_id=selected_batch AND j.attempts<3 AND j.run_after<=clock_timestamp()
  AND (j.status='queued' OR (j.status='running' AND j.lease_until<=clock_timestamp())) ORDER BY j.run_after,j.id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.stock_intake_jobs SET status='running',attempts=attempts+1,processing_version=processing_version+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '120 seconds',worker_id=worker
  WHERE id=job.id RETURNING * INTO job;
 RETURN to_jsonb(job)||jsonb_build_object('source',(SELECT to_jsonb(s) FROM public.stock_intake_sources s WHERE s.id=job.source_id));
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_claim(text) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_checkpoint(job public.stock_intake_jobs, rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE source public.stock_intake_sources; batch public.stock_intake_batches; input_row jsonb; fields jsonb; proposal jsonb;
 product public.products; existing public.stock_intake_batch_rows; draft public.stock_intake_batch_drafts;
 matches uuid[]; matched uuid; proposed_draft uuid; row_id uuid; group_id uuid; group_key text; draft_key text; warnings jsonb;
 input_sku text; input_barcode text; input_description text; supplier text; reference text; count_rows bigint;
BEGIN
 IF job.stage<>'parse' OR jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows) NOT BETWEEN 1 AND 100 OR pg_column_size(rows)>2097152 THEN RAISE EXCEPTION 'Bounded parser checkpoint required'; END IF;
 SELECT * INTO batch FROM public.stock_intake_batches WHERE id=job.batch_id FOR UPDATE;
 SELECT * INTO source FROM public.stock_intake_sources WHERE id=job.source_id FOR UPDATE;
 IF source.version<>job.content_revision OR source.excluded OR batch.status='cancelled' THEN RAISE EXCEPTION 'Source changed' USING ERRCODE='40001'; END IF;
 FOR input_row IN SELECT v FROM jsonb_array_elements(rows) v LOOP
  IF jsonb_typeof(input_row->'values') IS DISTINCT FROM 'object' OR jsonb_typeof(input_row->'cells') IS DISTINCT FROM 'object'
   OR pg_column_size(input_row)>32768 OR length(COALESCE(input_row->>'sheet','')) NOT BETWEEN 1 AND 255
   OR (input_row->>'row')::integer NOT BETWEEN 1 AND 40001
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source.plan->'sheets') s WHERE s->>'name'=input_row->>'sheet') THEN RAISE EXCEPTION 'Invalid worksheet provenance'; END IF;
  row_id:=track_private.stock_batch_key(source.id::text||':'||(input_row->>'sheet')||':'||(input_row->>'row'));
  SELECT * INTO existing FROM public.stock_intake_batch_rows WHERE id=row_id;
  IF FOUND AND existing.version=source.version THEN
   IF existing.raw<>input_row THEN RAISE EXCEPTION 'A completed checkpoint changed without a new processing version'; END IF;
   CONTINUE;
  END IF;
  IF existing.id IS NOT NULL THEN
   INSERT INTO public.stock_intake_batch_changes(organization_id,batch_id,actor_id,kind,affected,before_value)
    VALUES(batch.organization_id,batch.id,job.actor_id,'source_reprepare',jsonb_build_array(row_id),jsonb_build_object('review',existing.review,'raw',existing.raw,'version',existing.version));
  END IF;
  fields:=input_row->'values'; input_sku:=btrim(COALESCE(fields->>'sku','')); input_barcode:=btrim(COALESCE(fields->>'barcode',''));
  input_description:=btrim(COALESCE(fields->>'description','')); supplier:=btrim(COALESCE(fields->>'supplier','')); reference:=btrim(COALESCE(fields->>'invoice_reference',''));
  warnings:=COALESCE(input_row->'warnings','[]');
  group_key:=CASE WHEN reference<>'' THEN 'invoice:'||lower(supplier)||':'||reference||CASE WHEN supplier='' THEN ':'||source.id::text ELSE '' END ELSE 'sheet:'||source.id::text||':'||(input_row->>'sheet') END;
  group_id:=track_private.stock_batch_key(batch.id::text||':'||group_key);
  IF EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE id=group_id AND status='posted') THEN
   group_id:=track_private.stock_batch_key(batch.id::text||':'||group_key||':after-post:'||source.id::text);
  END IF;
  INSERT INTO public.stock_intake_groups(id,organization_id,batch_id,label,warehouse_id,supplier,invoice_reference,duplicate_reason)
   VALUES(group_id,batch.organization_id,batch.id,CASE WHEN reference<>'' THEN reference ELSE source.name||' / '||(input_row->>'sheet') END,batch.warehouse_id,supplier,reference,source.duplicate_reason)
   ON CONFLICT(id) DO UPDATE SET duplicate_reason=CASE WHEN stock_intake_groups.duplicate_reason='' THEN EXCLUDED.duplicate_reason ELSE stock_intake_groups.duplicate_reason END;
  matched:=NULL;proposed_draft:=NULL;matches:=NULL;product:=NULL;
  IF input_sku<>'' OR input_barcode<>'' THEN
   SELECT array_agg(id) INTO matches FROM (SELECT id FROM public.products WHERE organization_id=batch.organization_id AND ((input_sku<>'' AND products.sku=input_sku) OR (input_barcode<>'' AND products.barcode=input_barcode)) LIMIT 3) candidates;
  ELSIF input_description<>'' THEN
   SELECT array_agg(id) INTO matches FROM (SELECT id FROM public.products WHERE organization_id=batch.organization_id AND lower(btrim(name))=lower(input_description) LIMIT 2) candidates;
  END IF;
  IF cardinality(matches)=1 THEN
   SELECT * INTO product FROM public.products WHERE id=matches[1];
   IF (input_sku<>'' AND product.sku<>input_sku) OR (input_barcode<>'' AND COALESCE(product.barcode,'')<>input_barcode) THEN
    warnings:=warnings||jsonb_build_array('SKU and input_barcode conflict; select the correct product explicitly.');
   ELSIF product.status<>'active' OR product.medical_stock_managed THEN
    warnings:=warnings||jsonb_build_array('Use an active ordinary catalog product; medical products use their batch workflow.');
   ELSE matched:=product.id; END IF;
  ELSIF cardinality(matches)>1 THEN warnings:=warnings||jsonb_build_array('Product identifiers or variants are ambiguous; choose the product explicitly.');
  ELSE
   draft_key:=CASE WHEN input_sku<>'' OR input_barcode<>'' THEN 'identifiers:'||input_sku||':'||input_barcode ELSE 'description:'||lower(input_description) END;
   IF input_sku<>'' OR input_barcode<>'' OR input_description<>'' THEN
    proposed_draft:=track_private.stock_batch_key(batch.id::text||':draft:'||draft_key);
    proposal:=jsonb_build_object('draft_id',proposed_draft,'name',input_description,'sku',input_sku,'barcode',input_barcode,'selling_price',NULL,'cost_price',NULL,'stock_unit','piece','confirmed',false);
    INSERT INTO public.stock_intake_batch_drafts(id,organization_id,batch_id,document) VALUES(proposed_draft,batch.organization_id,batch.id,proposal) ON CONFLICT(id) DO NOTHING;
    SELECT * INTO draft FROM public.stock_intake_batch_drafts WHERE id=proposed_draft;
    IF lower(btrim(draft.document->>'name'))<>lower(input_description) THEN
     proposed_draft:=NULL;warnings:=warnings||jsonb_build_array('Repeated identifiers have different descriptions; review the variant before sharing a draft.');
    END IF;
   ELSE warnings:=warnings||jsonb_build_array('A product identity is required.'); END IF;
  END IF;
  proposal:=jsonb_build_object('id',row_id,'product_id',matched,'quantity',fields->'quantity','purchase_unit',COALESCE(fields->>'purchase_unit',''),
   'conversion',fields->'conversion','conversion_confirmed',false,'receipt_unit_cost',fields->'receipt_unit_cost',
   'product_snapshot',CASE WHEN matched IS NOT NULL THEN jsonb_build_object('name',product.name,'sku',product.sku,'barcode',product.barcode,'make',product.make,'status',product.status,'stock_unit',product.stock_unit) END);
  IF matched IS NULL THEN proposal:=proposal-'product_snapshot'; END IF;
  INSERT INTO public.stock_intake_batch_rows(id,organization_id,batch_id,source_id,version,sheet,row_number,raw,review,draft_id,group_id,warnings)
   VALUES(row_id,batch.organization_id,batch.id,source.id,source.version,input_row->>'sheet',(input_row->>'row')::integer,input_row,proposal,proposed_draft,group_id,warnings)
   ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,raw=EXCLUDED.raw,review=EXCLUDED.review,draft_id=EXCLUDED.draft_id,group_id=EXCLUDED.group_id,warnings=EXCLUDED.warnings,excluded=false;
  UPDATE public.stock_intake_batch_rows r SET issues=track_private.stock_batch_issues(track_private.stock_batch_row_review(r)) WHERE r.id=row_id;
 END LOOP;
 SELECT count(*) INTO count_rows FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version WHERE r.batch_id=batch.id;
 IF count_rows>20000 THEN RAISE EXCEPTION 'Batch exceeds 20,000 prepared rows; no truncated result is accepted'; END IF;
 IF (SELECT count(*) FROM public.stock_intake_groups WHERE batch_id=batch.id)>20000 THEN RAISE EXCEPTION 'Batch exceeds 20,000 receipt groups'; END IF;
 UPDATE public.stock_intake_jobs SET result=jsonb_build_object('prepared_rows',(SELECT count(*) FROM public.stock_intake_batch_rows WHERE source_id=source.id AND version=source.version)) WHERE id=job.id;
 RETURN jsonb_build_object('prepared_rows',count_rows);
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_checkpoint(public.stock_intake_jobs,jsonb) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_edit(command jsonb, actor public.users, batch public.stock_intake_batches) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE action text:=command->>'action'; source public.stock_intake_sources; current_group public.stock_intake_groups;
 selected uuid[]; affected uuid[]; value jsonb; old_values jsonb; patch jsonb; identifier uuid; count_selected integer; meta jsonb;
BEGIN
 IF batch.status IN('posting','cancelled') THEN RAISE EXCEPTION 'Wait for posting to finish, or preserve this cancelled batch'; END IF;
 IF action IN('configure','source_exclude') THEN
  SELECT * INTO source FROM public.stock_intake_sources WHERE id=(command->>'source_id')::uuid AND batch_id=batch.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable'; END IF;
  SELECT array_agg(DISTINCT group_id) INTO affected FROM public.stock_intake_batch_rows WHERE source_id=source.id;
  IF EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE id=ANY(COALESCE(affected,'{}')) AND status='posted') THEN RAISE EXCEPTION 'Source contains posted receipts and cannot be changed'; END IF;
  IF action='source_exclude' THEN
   IF jsonb_typeof(command->'excluded') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Explicit exclusion selection required'; END IF;
   UPDATE public.stock_intake_sources SET excluded=(command->>'excluded')::boolean WHERE id=source.id;
  ELSE
   IF source.verified_at IS NULL OR source.inspection IS NULL OR jsonb_typeof(command->'plan'->'sheets') IS DISTINCT FROM 'array'
    OR jsonb_array_length(command->'plan'->'sheets')=0 THEN RAISE EXCEPTION 'Wait for file inspection and select worksheets'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(command->'plan'->'sheets') chosen
    WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source.inspection->'sheets') available WHERE available->>'name'=chosen->>'name')) THEN RAISE EXCEPTION 'Selected worksheet unavailable'; END IF;
   IF jsonb_array_length(command->'plan'->'sheets')>10000 OR (SELECT count(DISTINCT chosen->>'name') FROM jsonb_array_elements(command->'plan'->'sheets') chosen)<>jsonb_array_length(command->'plan'->'sheets') THEN RAISE EXCEPTION 'Choose each supported worksheet once'; END IF;
   FOR value IN SELECT item FROM jsonb_array_elements(command->'plan'->'sheets') item LOOP
    IF jsonb_typeof(value->'columns') IS DISTINCT FROM 'object' OR jsonb_typeof(value->'headerRow') IS DISTINCT FROM 'number'
      OR value->>'headerRow' !~ '^[1-9][0-9]{0,4}$' OR (value->>'headerRow')::integer>20001 THEN RAISE EXCEPTION 'Valid header row and columns required'; END IF;
    IF NOT (value->'columns' ? 'quantity') OR NOT (value->'columns' ?| ARRAY['description','sku','barcode'])
     OR EXISTS(SELECT 1 FROM jsonb_each(value->'columns') mapped WHERE mapped.key NOT IN('description','sku','barcode','quantity','purchase_unit','conversion','receipt_unit_cost','supplier','invoice_reference')
      OR jsonb_typeof(mapped.value) IS DISTINCT FROM 'number' OR mapped.value::text !~ '^[0-9]{1,3}$' OR mapped.value::text::numeric>199) THEN RAISE EXCEPTION 'Map identity, quantity and supported columns explicitly'; END IF;
   END LOOP;
   IF length(COALESCE(command->>'duplicate_reason',''))>500 THEN RAISE EXCEPTION 'Duplicate reason too long'; END IF;
   IF source.plan IS DISTINCT FROM command->'plan' THEN
    UPDATE public.stock_intake_sources SET version=version+1,plan=command->'plan',stats=NULL,status='select_sheets',error=NULL,duplicate_reason=COALESCE(command->>'duplicate_reason','') WHERE id=source.id;
   ELSE UPDATE public.stock_intake_sources SET duplicate_reason=COALESCE(command->>'duplicate_reason','') WHERE id=source.id; END IF;
  END IF;
  UPDATE public.stock_intake_jobs SET status='cancelled',lease_until=NULL WHERE source_id=source.id AND status IN('queued','running');
  PERFORM track_private.stock_batch_invalidate(batch.id,COALESCE(affected,'{}'));
  INSERT INTO public.stock_intake_batch_changes(organization_id,batch_id,actor_id,kind,affected,before_value,after_value)
   VALUES(batch.organization_id,batch.id,actor.id,action,jsonb_build_array(source.id),to_jsonb(source),command-'expected_revision');
 ELSIF action='group' THEN
  identifier:=(command->>'group_id')::uuid;
  SELECT * INTO current_group FROM public.stock_intake_groups WHERE id=identifier FOR UPDATE;
  IF FOUND AND current_group.batch_id<>batch.id THEN RAISE EXCEPTION 'Receipt group unavailable'; END IF;
  IF current_group.status='posted' THEN RAISE EXCEPTION 'Posted receipts are immutable'; END IF;
  IF current_group.id IS NULL AND (SELECT count(*) FROM public.stock_intake_groups WHERE batch_id=batch.id)>=20000 THEN RAISE EXCEPTION 'Batch has reached its 20,000 receipt-group limit'; END IF;
  IF length(COALESCE(command->>'label','')) NOT BETWEEN 1 AND 255 OR length(COALESCE(command->>'supplier',''))>255
   OR length(COALESCE(command->>'invoice_reference',''))>100 OR length(COALESCE(command->>'duplicate_reason',''))>500
   OR jsonb_typeof(command->'excluded') IS DISTINCT FROM 'boolean' OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=(command->>'warehouse_id')::uuid AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Valid receipt identity and location required'; END IF;
  INSERT INTO public.stock_intake_groups(id,organization_id,batch_id,label,warehouse_id,supplier,invoice_reference,duplicate_reason,excluded)
   VALUES(identifier,batch.organization_id,batch.id,command->>'label',(command->>'warehouse_id')::uuid,COALESCE(command->>'supplier',''),COALESCE(command->>'invoice_reference',''),COALESCE(command->>'duplicate_reason',''),(command->>'excluded')::boolean)
   ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,warehouse_id=EXCLUDED.warehouse_id,supplier=EXCLUDED.supplier,invoice_reference=EXCLUDED.invoice_reference,duplicate_reason=EXCLUDED.duplicate_reason,excluded=EXCLUDED.excluded;
  PERFORM track_private.stock_batch_invalidate(batch.id,ARRAY[identifier]);
  INSERT INTO public.stock_intake_batch_changes(organization_id,batch_id,actor_id,kind,affected,before_value,after_value)
   VALUES(batch.organization_id,batch.id,actor.id,action,jsonb_build_array(identifier),to_jsonb(current_group),command-'expected_revision');
 ELSIF action='draft' THEN
  value:=command->'document';identifier:=(value->>'draft_id')::uuid;
  IF identifier IS NULL OR jsonb_typeof(value) IS DISTINCT FROM 'object' OR pg_column_size(value)>8192 THEN RAISE EXCEPTION 'Bounded product draft required'; END IF;
  IF EXISTS(SELECT 1 FROM public.stock_intake_batch_drafts WHERE id=identifier AND batch_id<>batch.id) THEN RAISE EXCEPTION 'Product draft unavailable'; END IF;
  SELECT array_agg(DISTINCT r.group_id) INTO affected FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version WHERE r.batch_id=batch.id AND r.draft_id=identifier;
  IF EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE id=ANY(COALESCE(affected,'{}')) AND status='posted') THEN RAISE EXCEPTION 'This shared draft has posted; select the created catalog product for further corrections'; END IF;
  SELECT document INTO old_values FROM public.stock_intake_batch_drafts WHERE id=identifier;
  INSERT INTO public.stock_intake_batch_drafts(id,organization_id,batch_id,document) VALUES(identifier,batch.organization_id,batch.id,value) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document;
  IF (old_values-ARRAY['cost_price','selling_price','confirmed']) IS DISTINCT FROM (value-ARRAY['cost_price','selling_price','confirmed']) THEN
   UPDATE public.stock_intake_batch_rows SET review=review||jsonb_build_object('conversion_confirmed',false) WHERE batch_id=batch.id AND draft_id=identifier;
  END IF;
  UPDATE public.stock_intake_batch_rows r SET issues=track_private.stock_batch_issues(track_private.stock_batch_row_review(r)) WHERE r.batch_id=batch.id AND r.draft_id=identifier;
  PERFORM track_private.stock_batch_invalidate(batch.id,COALESCE(affected,'{}'));
  INSERT INTO public.stock_intake_batch_changes(organization_id,batch_id,actor_id,kind,affected,before_value,after_value)
   VALUES(batch.organization_id,batch.id,actor.id,action,jsonb_build_array(identifier),old_values,value);
 ELSIF action='rows' THEN
  IF jsonb_typeof(command->'ids') IS DISTINCT FROM 'array' OR jsonb_array_length(command->'ids') NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'Select the affected rows explicitly'; END IF;
  SELECT array_agg(v::uuid) INTO selected FROM jsonb_array_elements_text(command->'ids') v;
  IF (SELECT count(DISTINCT id) FROM unnest(selected) id)<>cardinality(selected) THEN RAISE EXCEPTION 'Select each row once'; END IF;
  SELECT count(*),array_agg(DISTINCT r.group_id),jsonb_object_agg(r.id::text,track_private.stock_batch_row_review(r)) INTO count_selected,affected,old_values
   FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version WHERE r.batch_id=batch.id AND r.id=ANY(selected);
  IF count_selected<>cardinality(selected) THEN RAISE EXCEPTION 'Selected rows changed or are unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE id=ANY(affected) AND status='posted') THEN RAISE EXCEPTION 'Posted rows are immutable'; END IF;
  IF EXISTS(SELECT 1 FROM public.stock_intake_jobs WHERE batch_id=batch.id AND stage IN('inspect','parse') AND status IN('queued','running')) THEN RAISE EXCEPTION 'Wait for source preparation before correcting rows'; END IF;
  patch:=COALESCE(command->'patch','{}');
  IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR pg_column_size(patch)>8192 OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch) k WHERE k NOT IN('product_id','draft_id','quantity','purchase_unit','conversion','conversion_confirmed','receipt_unit_cost')) THEN RAISE EXCEPTION 'Invalid review fields'; END IF;
  IF patch ? 'draft_id' AND patch->>'draft_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.stock_intake_batch_drafts WHERE id=(patch->>'draft_id')::uuid AND batch_id=batch.id) THEN RAISE EXCEPTION 'Product draft unavailable'; END IF;
  IF patch ? 'product_id' AND patch->>'product_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=(patch->>'product_id')::uuid AND organization_id=batch.organization_id AND status='active' AND NOT medical_stock_managed) THEN RAISE EXCEPTION 'Choose an active ordinary product in this business'; END IF;
  IF command ? 'group_id' THEN
   identifier:=(command->>'group_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.stock_intake_groups WHERE id=identifier AND batch_id=batch.id AND status<>'posted') THEN RAISE EXCEPTION 'Destination receipt unavailable'; END IF;
   affected:=affected||identifier;
  END IF;
  -- Changing the product or pack basis requires a fresh explicit confirmation.
  IF patch ?| ARRAY['product_id','draft_id','purchase_unit','conversion'] AND NOT patch ? 'conversion_confirmed' THEN
   patch:=patch||jsonb_build_object('conversion_confirmed',false);
  END IF;
  UPDATE public.stock_intake_batch_rows r SET review=(r.review||(patch-'draft_id')),
   draft_id=CASE WHEN patch ? 'draft_id' THEN (patch->>'draft_id')::uuid WHEN patch->>'product_id' IS NOT NULL THEN NULL ELSE r.draft_id END,
   group_id=CASE WHEN command ? 'group_id' THEN identifier ELSE r.group_id END,
   excluded=CASE WHEN command ? 'excluded' THEN (command->>'excluded')::boolean ELSE r.excluded END WHERE r.id=ANY(selected) AND r.batch_id=batch.id;
  UPDATE public.stock_intake_batch_rows SET review=review||jsonb_build_object('product_id',NULL) WHERE id=ANY(selected) AND draft_id IS NOT NULL;
  UPDATE public.stock_intake_batch_rows r SET issues=track_private.stock_batch_issues(track_private.stock_batch_row_review(r)) WHERE r.id=ANY(selected);
  PERFORM track_private.stock_batch_invalidate(batch.id,affected);
  INSERT INTO public.stock_intake_batch_changes(organization_id,batch_id,actor_id,kind,affected,before_value,after_value)
   VALUES(batch.organization_id,batch.id,actor.id,action,to_jsonb(selected),old_values,command-'expected_revision');
 ELSE RAISE EXCEPTION 'Unknown batch edit'; END IF;
 RETURN jsonb_build_object('batch',(SELECT to_jsonb(b) FROM public.stock_intake_batches b WHERE b.id=batch.id));
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_edit(jsonb,public.users,public.stock_intake_batches) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_evidence(line_id uuid, prepared_by uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE evidence jsonb;
BEGIN
 SELECT jsonb_build_object('kind','spreadsheet','batch_id',r.batch_id,'source_id',s.id,'sha256',s.sha256,'source_version',s.version,'sheet',r.sheet,'row_number',r.row_number,'prepared_by',prepared_by)
 INTO evidence FROM track_private.stock_intake_batch_context c JOIN public.stock_intake_batch_rows r ON r.group_id=c.group_id AND r.batch_id=c.batch_id
  JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version
 WHERE c.backend=pg_backend_pid() AND c.transaction_id=txid_current() AND r.id=line_id AND NOT r.excluded AND NOT s.excluded AND s.status='prepared';
 IF evidence IS NULL THEN RAISE EXCEPTION 'Prepared line lacks verified source provenance'; END IF;
 RETURN evidence;
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_evidence(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_reuses_draft(candidate uuid, draft jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM track_private.stock_intake_batch_context c JOIN public.stock_intake_batches b ON b.id=c.batch_id
  JOIN public.products p ON p.id=candidate AND p.organization_id=b.organization_id
  WHERE c.backend=pg_backend_pid() AND c.transaction_id=txid_current() AND p.status='active' AND NOT p.medical_stock_managed
   AND p.stock_unit=COALESCE(draft->>'stock_unit','piece') AND p.variant_size IS NULL AND p.variant_colour IS NULL AND p.model IS NULL
   AND jsonb_build_object('name',p.name,'sku',p.sku,'barcode',COALESCE(p.barcode,''),'cost_price',p.cost_price,'selling_price',p.selling_price)
    =jsonb_build_object('name',draft->>'name','sku',draft->>'sku','barcode',COALESCE(draft->>'barcode',''),'cost_price',draft->'cost_price','selling_price',draft->'selling_price')
   AND EXISTS(SELECT 1 FROM public.stock_intakes i JOIN public.stock_intake_lines l ON l.receipt_id=i.id
     WHERE i.batch_id=b.id AND i.status='posted' AND l.product_draft_id=candidate AND l.posted_product_id=candidate))
$$;
REVOKE ALL ON FUNCTION track_private.stock_batch_reuses_draft(uuid,jsonb) FROM PUBLIC;

CREATE FUNCTION track_private.stock_batch_prepare(job public.stock_intake_jobs) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b public.stock_intake_batches; g public.stock_intake_groups; document jsonb; saved jsonb; prepared_receipt_id uuid; previous_sub text;
BEGIN
 SELECT * INTO b FROM public.stock_intake_batches WHERE id=job.batch_id;
 SELECT * INTO g FROM public.stock_intake_groups WHERE id=job.group_id FOR UPDATE;
 IF g.status='posted' THEN RAISE EXCEPTION 'Posted receipt is immutable'; END IF;
 IF g.supplier<>'' AND g.invoice_reference<>'' AND length(btrim(g.duplicate_reason))<8 AND EXISTS(
  SELECT 1 FROM public.stock_intakes WHERE organization_id=b.organization_id AND status='posted'
   AND invoice_fingerprint=encode(public.digest(lower(btrim(g.supplier))||E'\n'||lower(btrim(g.invoice_reference)),'sha256'),'hex')
   AND id IS DISTINCT FROM g.receipt_id) THEN RAISE EXCEPTION 'Duplicate invoice: enter an acknowledgment reason before review'; END IF;
 IF EXISTS(SELECT 1 FROM public.stock_intake_sources WHERE batch_id=b.id AND NOT excluded AND status<>'prepared') THEN RAISE EXCEPTION 'Finish or exclude unfinished sources before preparing receipts'; END IF;
 IF EXISTS(SELECT 1 FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version
   WHERE r.group_id=g.id AND NOT r.excluded AND NOT s.excluded AND length(btrim(s.duplicate_reason))<8
    AND EXISTS(SELECT 1 FROM public.stock_intake_sources other WHERE other.organization_id=s.organization_id AND other.sha256=s.sha256 AND other.verified_at IS NOT NULL
      AND (other.created_at<s.created_at OR (other.created_at=s.created_at AND other.id<s.id)))) THEN RAISE EXCEPTION 'A duplicate source requires an explicit acknowledgment reason'; END IF;
 SELECT jsonb_build_object('mode',b.mode,'warehouse_id',g.warehouse_id,'supplier',g.supplier,'invoice_reference',g.invoice_reference,'duplicate_reason',g.duplicate_reason,
   'notes','Prepared from stock intake batch '||b.id,'lines',COALESCE(jsonb_agg(track_private.stock_batch_row_review(r) ORDER BY s.created_at,s.id,r.sheet,r.row_number,r.id),'[]')) INTO document
 FROM public.stock_intake_batch_rows r JOIN public.stock_intake_sources s ON s.id=r.source_id AND s.version=r.version
 WHERE r.group_id=g.id AND NOT r.excluded AND NOT s.excluded;
 prepared_receipt_id:=COALESCE(g.receipt_id,gen_random_uuid());
 previous_sub:=current_setting('request.jwt.claim.sub',true);
 PERFORM set_config('request.jwt.claim.sub',job.actor_id::text,true);
 INSERT INTO track_private.stock_intake_batch_context(backend,transaction_id,batch_id,group_id) VALUES(pg_backend_pid(),txid_current(),b.id,g.id);
 saved:=public.save_stock_intake(prepared_receipt_id,COALESCE((SELECT revision FROM public.stock_intakes WHERE id=prepared_receipt_id),0),document);
 UPDATE public.stock_intakes SET batch_id=b.id WHERE id=prepared_receipt_id;
 UPDATE public.stock_intake_groups SET receipt_id=prepared_receipt_id,status='ready',prepared_hash=saved->>'payload_hash',error=NULL WHERE id=g.id;
 -- Canonical snapshots shown in review match exactly what approval will bind.
 UPDATE public.stock_intake_batch_rows r SET review=line.value-'new_product' FROM jsonb_array_elements(saved->'document'->'lines') line(value)
  WHERE r.id=(line.value->>'id')::uuid AND r.group_id=g.id;
 DELETE FROM track_private.stock_intake_batch_context WHERE backend=pg_backend_pid() AND transaction_id=txid_current();
 PERFORM set_config('request.jwt.claim.sub',COALESCE(previous_sub,''),true);
 RETURN jsonb_build_object('receipt_id',prepared_receipt_id,'payload_hash',saved->>'payload_hash');
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_prepare(public.stock_intake_jobs) FROM PUBLIC;

-- Versioned shared-command definitions: manual limits stay unchanged; only the
-- private batch transaction context admits complete bulk receipts/provenance.
CREATE FUNCTION track_private.normalize_stock_intake_line(actor public.users, line jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE product public.products; units bigint; cost numeric; draft jsonb;
BEGIN
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
   IF (draft ? 'stock_unit' AND jsonb_typeof(draft->'stock_unit') IS DISTINCT FROM 'string') OR COALESCE(draft->>'stock_unit','piece') NOT IN('piece','pair','pack','carton','bag','g','kg','mL','L','cm','m','tablet','bottle','vial') THEN RAISE EXCEPTION 'Choose a supported stock unit'; END IF;
   draft:=draft||jsonb_build_object('stock_unit',COALESCE(draft->>'stock_unit','piece'),'draft_id',(draft->>'draft_id')::uuid,'name',trim(draft->>'name'),'sku',trim(draft->>'sku'),'barcode',trim(COALESCE(draft->>'barcode','')));
   line:=line||jsonb_build_object('product_id',NULL,'new_product',draft);
   IF EXISTS(SELECT 1 FROM public.products WHERE id=(draft->>'draft_id')::uuid OR (organization_id=actor.organization_id AND (sku=draft->>'sku' OR (NULLIF(draft->>'barcode','') IS NOT NULL AND barcode=draft->>'barcode')))) AND NOT track_private.stock_batch_reuses_draft((draft->>'draft_id')::uuid,draft) THEN RAISE EXCEPTION 'New product identifier conflicts with catalog; review required'; END IF;
  END IF;
 RETURN line||jsonb_build_object('id',(line->>'id')::uuid,'purchase_unit',trim(line->>'purchase_unit'),'stock_units',units,'evidence',CASE WHEN track_private.stock_batch_context() THEN track_private.stock_batch_evidence((line->>'id')::uuid,actor.id) ELSE jsonb_build_object('kind','manual','entered_by',actor.id) END);
END $$;
REVOKE ALL ON FUNCTION track_private.normalize_stock_intake_line(public.users,jsonb) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.save_stock_intake(receipt_id uuid, expected_revision integer, receipt_document jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; existing public.stock_intakes; product public.products;
 line jsonb; prepared jsonb:='[]'; normalized jsonb; fingerprint text; hash text; units bigint; cost numeric; total numeric:=0; draft jsonb;
BEGIN
 actor:=track_private.intake_actor();
 IF EXISTS(SELECT 1 FROM public.stock_intakes WHERE id=receipt_id AND batch_id IS NOT NULL) AND NOT track_private.stock_batch_context(receipt_id) THEN RAISE EXCEPTION 'Review this receipt in its batch'; END IF;
 IF NOT (SELECT intake_enabled FROM track_private.stock_command_settings WHERE singleton) THEN RAISE EXCEPTION 'Stock intake is disabled'; END IF;
 IF receipt_id IS NULL OR expected_revision IS NULL OR expected_revision<0 OR jsonb_typeof(receipt_document) IS DISTINCT FROM 'object'
  OR pg_column_size(receipt_document)>(CASE WHEN track_private.stock_batch_context() THEN 20971520 ELSE 2097152 END) OR receipt_document->>'mode' NOT IN('opening_stock','additional_delivery')
  OR receipt_document->>'mode' IS NULL OR jsonb_typeof(receipt_document->'lines') IS DISTINCT FROM 'array'
  OR jsonb_array_length(receipt_document->'lines') NOT BETWEEN 1 AND (CASE WHEN track_private.stock_batch_context() THEN 20000 ELSE 1000 END)
  OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=(receipt_document->>'warehouse_id')::uuid AND organization_id=actor.organization_id)
 THEN RAISE EXCEPTION 'Valid mode, location and 1 to 1000 lines required'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['supplier','invoice_reference','notes','duplicate_reason']) AS fields(name)
  WHERE receipt_document ? fields.name AND jsonb_typeof(receipt_document->fields.name) IS DISTINCT FROM 'string')
  OR length(COALESCE(receipt_document->>'supplier',''))>255 OR length(COALESCE(receipt_document->>'invoice_reference',''))>100
  OR length(COALESCE(receipt_document->>'notes',''))>2000 OR length(COALESCE(receipt_document->>'duplicate_reason',''))>500
 THEN RAISE EXCEPTION 'Receipt references and notes must be bounded text'; END IF;
 IF (SELECT count(DISTINCT (value->>'id')::uuid) FROM jsonb_array_elements(receipt_document->'lines'))<>jsonb_array_length(receipt_document->'lines') THEN RAISE EXCEPTION 'Unique line IDs required'; END IF;
 SELECT jsonb_agg(track_private.normalize_stock_intake_line(actor,value) ORDER BY ordinal) INTO prepared FROM jsonb_array_elements(receipt_document->'lines') WITH ORDINALITY lines(value,ordinal);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(prepared) v WHERE v->'new_product'->>'draft_id' IS NOT NULL GROUP BY v->'new_product'->>'draft_id' HAVING count(DISTINCT v->'new_product')>1) THEN RAISE EXCEPTION 'Shared product draft differs between lines'; END IF;
 SELECT sum((v->>'receipt_unit_cost')::numeric*(v->>'quantity')::integer) INTO total FROM jsonb_array_elements(prepared) v;
 IF total>9999999999.99 THEN RAISE EXCEPTION 'Receipt cost exceeds supported precision'; END IF;
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
CREATE OR REPLACE FUNCTION public.approve_stock_intake(receipt_id uuid, expected_revision integer, expected_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; receipt public.stock_intakes; approval uuid;
BEGIN
 actor:=track_private.intake_actor();
 IF EXISTS(SELECT 1 FROM public.stock_intakes WHERE id=receipt_id AND batch_id IS NOT NULL) AND NOT track_private.stock_batch_context(receipt_id) THEN RAISE EXCEPTION 'Review this receipt in its batch'; END IF;
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
CREATE OR REPLACE FUNCTION public.post_stock_intake(receipt_id uuid, approval_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; receipt public.stock_intakes; approval public.stock_intake_approvals; line jsonb; draft jsonb;
 product public.products; location uuid; position record; stock public.inventory; mapping jsonb:='{}'; posted_lines jsonb:='[]'; stocks jsonb:='[]'; resolved uuid; posted_result jsonb;
BEGIN
 actor:=track_private.intake_actor();
 IF EXISTS(SELECT 1 FROM public.stock_intakes WHERE id=receipt_id AND batch_id IS NOT NULL) AND NOT track_private.stock_batch_context(receipt_id) THEN RAISE EXCEPTION 'Review this receipt in its batch'; END IF;
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
 FOR draft IN SELECT d FROM (SELECT DISTINCT value->'new_product' d FROM jsonb_array_elements(receipt.document->'lines') WHERE jsonb_typeof(value->'new_product')='object') drafts ORDER BY (d->>'draft_id')::uuid LOOP
  resolved:=(draft->>'draft_id')::uuid;
  IF NOT track_private.stock_batch_reuses_draft(resolved,draft) THEN
    IF EXISTS(SELECT 1 FROM public.products WHERE organization_id=actor.organization_id AND (sku=draft->>'sku' OR (NULLIF(draft->>'barcode','') IS NOT NULL AND barcode=draft->>'barcode'))) THEN RAISE EXCEPTION 'New product identifier conflicts; review again'; END IF;
    INSERT INTO public.products(id,organization_id,name,sku,barcode,selling_price,cost_price,stock_unit,created_by)
     VALUES(resolved,actor.organization_id,trim(draft->>'name'),trim(draft->>'sku'),NULLIF(draft->>'barcode',''),(draft->>'selling_price')::numeric,(draft->>'cost_price')::numeric,COALESCE(draft->>'stock_unit','piece'),actor.id);
  END IF;
 END LOOP;
 FOR line IN SELECT d FROM (SELECT DISTINCT jsonb_build_object('product_id',value->'product_id','product_snapshot',value->'product_snapshot') d FROM jsonb_array_elements(receipt.document->'lines') WHERE NULLIF(value->>'product_id','') IS NOT NULL) identities ORDER BY (d->>'product_id')::uuid,d LOOP
   SELECT * INTO product FROM public.products WHERE id=(line->>'product_id')::uuid AND organization_id=actor.organization_id FOR SHARE;
   IF NOT FOUND OR jsonb_build_object('name',product.name,'sku',product.sku,'barcode',product.barcode,'make',product.make,'status',product.status,'stock_unit',to_jsonb(product)->'stock_unit','variant_size',to_jsonb(product)->'variant_size','variant_colour',to_jsonb(product)->'variant_colour','model',to_jsonb(product)->'model') IS DISTINCT FROM line->'product_snapshot'
    OR product.status<>'active' THEN RAISE EXCEPTION 'Product identity changed; review receipt again'; END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('line_id',value->>'id','product_id',COALESCE(NULLIF(value->>'product_id',''),value->'new_product'->>'draft_id')::uuid,'stock_units',(value->>'stock_units')::integer) ORDER BY COALESCE(value->>'product_id',value->'new_product'->>'draft_id'),value->>'id') INTO posted_lines FROM jsonb_array_elements(receipt.document->'lines');
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
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'warehouse_id',i.warehouse_id,'quantity',i.quantity,'added',p.units) ORDER BY p.product_id) INTO stocks
 FROM (SELECT (v->>'product_id')::uuid product_id,sum((v->>'stock_units')::bigint) units FROM jsonb_array_elements(posted_lines) v GROUP BY 1) p
 JOIN public.inventory i ON i.organization_id=actor.organization_id AND i.product_id=p.product_id AND i.warehouse_id=location;
 UPDATE public.stock_intake_lines l SET posted_product_id=(v->>'product_id')::uuid FROM jsonb_array_elements(posted_lines) v WHERE l.receipt_id=receipt.id AND l.id=(v->>'line_id')::uuid;
 posted_result:=jsonb_build_object('receipt_id',receipt.id,'approval_id',approval.id,'status','posted','receipt_cost_total',receipt.document->'receipt_cost_total','stocks',stocks,'lines',posted_lines,'posted_at',now());
 UPDATE public.stock_intakes SET status='posted',result=posted_result,updated_at=now() WHERE id=receipt.id;
 RETURN posted_result;
END $$;

CREATE FUNCTION track_private.stock_batch_approve_group(target uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g public.stock_intake_groups; receipt public.stock_intakes; saved jsonb;
BEGIN
 SELECT * INTO g FROM public.stock_intake_groups WHERE id=target;
 SELECT * INTO receipt FROM public.stock_intakes WHERE id=g.receipt_id AND batch_id=g.batch_id;
 IF receipt.id IS NULL OR receipt.payload_hash IS DISTINCT FROM g.prepared_hash THEN RAISE EXCEPTION 'Prepared receipt changed; review again'; END IF;
 INSERT INTO track_private.stock_intake_batch_context(backend,transaction_id,batch_id,group_id) VALUES(pg_backend_pid(),txid_current(),g.batch_id,g.id);
 saved:=public.approve_stock_intake(receipt.id,receipt.revision,receipt.payload_hash);
 DELETE FROM track_private.stock_intake_batch_context WHERE backend=pg_backend_pid() AND transaction_id=txid_current();
 RETURN jsonb_build_object('group_id',g.id,'receipt_id',receipt.id,'approval_id',saved->>'approval_id','hash',receipt.payload_hash,'warehouse_id',g.warehouse_id);
END $$;
REVOKE ALL ON FUNCTION track_private.stock_batch_approve_group(uuid) FROM PUBLIC;

CREATE FUNCTION public.stock_intake_batch_command(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='55s' AS $$
DECLARE actor public.users; b public.stock_intake_batches; s public.stock_intake_sources;
 action text:=command->>'action'; identifier uuid; chosen uuid[]; affected uuid[]; selection jsonb; manifest jsonb; approved_receipts jsonb; old_approval public.stock_intake_batch_approvals;
 total_files bigint; total_bytes bigint;
BEGIN
 actor:=track_private.stock_batch_actor();
 IF jsonb_typeof(command) IS DISTINCT FROM 'object' OR pg_column_size(command)>4194304 THEN RAISE EXCEPTION 'Bounded batch command required'; END IF;
 IF action='create' THEN
  identifier:=(command->>'id')::uuid;
  SELECT * INTO b FROM public.stock_intake_batches WHERE id=identifier FOR UPDATE;
  IF FOUND THEN
   IF b.organization_id<>actor.organization_id THEN RAISE EXCEPTION 'Batch unavailable' USING ERRCODE='42501'; END IF;
   IF b.mode IS DISTINCT FROM command->>'mode' OR b.warehouse_id IS DISTINCT FROM (command->>'warehouse_id')::uuid THEN RAISE EXCEPTION 'Batch identifier already has different settings'; END IF;
  ELSE
   IF command->>'mode' NOT IN('opening_stock','additional_delivery') OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=(command->>'warehouse_id')::uuid AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Choose mode and a location in this business'; END IF;
   INSERT INTO public.stock_intake_batches(id,organization_id,created_by,mode,warehouse_id) VALUES(identifier,actor.organization_id,actor.id,command->>'mode',(command->>'warehouse_id')::uuid) RETURNING * INTO b;
  END IF;
  RETURN jsonb_build_object('batch',to_jsonb(b));
 END IF;
 SELECT * INTO b FROM public.stock_intake_batches WHERE id=(command->>'batch_id')::uuid AND organization_id=actor.organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch unavailable' USING ERRCODE='P0002'; END IF;
 IF b.status='cancelled' THEN RAISE EXCEPTION 'This batch was cancelled; its saved evidence remains available'; END IF;
 -- Registration replays return the original session metadata after a lost acknowledgment.
 IF action='register' THEN
  SELECT * INTO s FROM public.stock_intake_sources WHERE id=(command->'source'->>'id')::uuid;
  IF FOUND THEN
   IF s.batch_id<>b.id OR s.organization_id<>actor.organization_id OR s.sha256 IS DISTINCT FROM command->'source'->>'sha256'
    OR s.bytes IS DISTINCT FROM (command->'source'->>'bytes')::bigint OR s.name IS DISTINCT FROM command->'source'->>'name' THEN RAISE EXCEPTION 'Source identifier already has different content'; END IF;
   IF s.verified_at IS NULL AND s.upload_expires_at<=clock_timestamp() AND s.created_by=actor.id AND NOT s.excluded THEN
    UPDATE public.stock_intake_sources SET upload_expires_at=clock_timestamp()+interval '2 hours',status='uploading',error=NULL WHERE id=s.id RETURNING * INTO s;
    PERFORM track_private.stock_batch_enqueue(b.id,actor.id,'inspect',s.id,NULL,s.version);
   END IF;
   RETURN jsonb_build_object('batch',to_jsonb(b),'source',to_jsonb(s));
  END IF;
 END IF;
 IF action<>'uploaded' AND (command->>'expected_revision')::integer IS DISTINCT FROM b.revision THEN RAISE EXCEPTION 'Batch revision changed; refresh before editing' USING ERRCODE='40001'; END IF;
 IF action IN('configure','source_exclude','rows','draft','group') THEN RETURN track_private.stock_batch_edit(command,actor,b); END IF;
 IF action='register' THEN
  IF b.status='posting' THEN RAISE EXCEPTION 'Finish posting before adding sources'; END IF;
  IF length(COALESCE(command->'source'->>'name','')) NOT BETWEEN 1 AND 255 OR command->'source'->>'name' !~* '\.(csv|xlsx)$' OR command->'source'->>'name' ~ '[[:cntrl:]]'
   OR jsonb_typeof(command->'source'->'bytes') IS DISTINCT FROM 'number' OR (command->'source'->>'bytes')::bigint NOT BETWEEN 1 AND 20971520
   OR command->'source'->>'sha256' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Valid CSV/XLSX metadata, SHA-256 and a file no larger than 20 MiB required'; END IF;
  SELECT count(*),COALESCE(sum(bytes),0) INTO total_files,total_bytes FROM public.stock_intake_sources WHERE batch_id=b.id;
  IF total_files>=100 OR total_bytes+(command->'source'->>'bytes')::bigint>262144000 THEN RAISE EXCEPTION 'Batch limit: 100 files and 250 MiB; no file was registered'; END IF;
  identifier:=(command->'source'->>'id')::uuid;
  INSERT INTO public.stock_intake_sources(id,organization_id,batch_id,created_by,name,bytes,sha256,object_key)
   VALUES(identifier,b.organization_id,b.id,actor.id,command->'source'->>'name',(command->'source'->>'bytes')::bigint,command->'source'->>'sha256',
    b.organization_id::text||'/'||b.id::text||'/'||identifier::text||CASE WHEN command->'source'->>'name' ~* '\.xlsx$' THEN '.xlsx' ELSE '.csv' END) RETURNING * INTO s;
  -- Accept durable work with the upload session, not a browser callback. Missing
  -- objects wait until session expiry without consuming extraction attempts.
  PERFORM track_private.stock_batch_enqueue(b.id,actor.id,'inspect',s.id,NULL,s.version);
  UPDATE public.stock_intake_jobs SET run_after=clock_timestamp()+interval '5 seconds' WHERE source_id=s.id AND stage='inspect' AND status='queued';
  PERFORM track_private.stock_batch_invalidate(b.id,'{}');
  PERFORM track_private.stock_batch_refresh(b.id);
  RETURN jsonb_build_object('batch',(SELECT to_jsonb(current) FROM public.stock_intake_batches current WHERE id=b.id),'source',to_jsonb(s));
 ELSIF action='uploaded' THEN
  SELECT * INTO s FROM public.stock_intake_sources WHERE id=(command->>'source_id')::uuid AND batch_id=b.id FOR UPDATE;
  IF NOT FOUND OR s.excluded THEN RAISE EXCEPTION 'Source unavailable'; END IF;
  IF s.verified_at IS NULL THEN
   PERFORM track_private.stock_batch_enqueue(b.id,actor.id,'inspect',s.id,NULL,s.version);
   UPDATE public.stock_intake_sources SET status='queued',error=NULL WHERE id=s.id;
  END IF;
 ELSIF action='process' THEN
  IF b.status='posting' THEN RAISE EXCEPTION 'Posting is already in progress'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.stock_intake_sources WHERE batch_id=b.id AND NOT excluded) THEN RAISE EXCEPTION 'Choose at least one source'; END IF;
  IF EXISTS(SELECT 1 FROM public.stock_intake_sources WHERE batch_id=b.id AND NOT excluded AND (verified_at IS NULL OR plan IS NULL)) THEN RAISE EXCEPTION 'Finish uploads, select worksheets and map columns for every included source'; END IF;
  FOR s IN SELECT * FROM public.stock_intake_sources WHERE batch_id=b.id AND NOT excluded AND status<>'prepared' LOOP
   IF length(btrim(s.duplicate_reason))<8 AND EXISTS(SELECT 1 FROM public.stock_intake_sources other WHERE other.organization_id=s.organization_id AND other.sha256=s.sha256 AND other.verified_at IS NOT NULL
    AND (other.created_at<s.created_at OR (other.created_at=s.created_at AND other.id<s.id))) THEN RAISE EXCEPTION 'A repeated source requires an acknowledgment reason'; END IF;
   PERFORM track_private.stock_batch_enqueue(b.id,actor.id,'parse',s.id,NULL,s.version);
   UPDATE public.stock_intake_sources SET status='queued',error=NULL WHERE id=s.id;
  END LOOP;
 ELSIF action='prepare' THEN
  IF b.status='posting' OR EXISTS(SELECT 1 FROM public.stock_intake_sources WHERE batch_id=b.id AND NOT excluded AND status<>'prepared') THEN RAISE EXCEPTION 'Finish or exclude unfinished sources before receipt review'; END IF;
  SELECT array_agg(v::uuid) INTO chosen FROM jsonb_array_elements_text(command->'group_ids') v;
  IF chosen IS NULL OR cardinality(chosen) NOT BETWEEN 1 AND 20000 OR (SELECT count(DISTINCT id) FROM unnest(chosen) id)<>cardinality(chosen)
   OR (SELECT count(*) FROM public.stock_intake_groups WHERE id=ANY(chosen) AND batch_id=b.id AND status<>'posted' AND NOT excluded)<>cardinality(chosen) THEN RAISE EXCEPTION 'Select unposted receipt groups in this batch'; END IF;
  PERFORM track_private.stock_batch_invalidate(b.id,chosen);
  INSERT INTO public.stock_intake_jobs(organization_id,batch_id,actor_id,stage,group_id,content_revision,job_key)
   SELECT b.organization_id,b.id,actor.id,'prepare',id,revision,b.id::text||':prepare:'||id::text||':'||revision||':' FROM public.stock_intake_groups WHERE id=ANY(chosen);
  UPDATE public.stock_intake_groups SET status='preparing',error=NULL WHERE id=ANY(chosen);
 ELSIF action='approve' THEN
  IF command->'exclusions_acknowledged' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(command->'receipts') IS DISTINCT FROM 'array' OR jsonb_array_length(command->'receipts') NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION 'Review selected receipts and acknowledge exclusions'; END IF;
  SELECT array_agg((v->>'group_id')::uuid ORDER BY (v->>'group_id')::uuid),jsonb_agg(jsonb_build_object('group_id',(v->>'group_id')::uuid,'hash',v->>'hash') ORDER BY (v->>'group_id')::uuid)
   INTO chosen,selection FROM jsonb_array_elements(command->'receipts') v;
  IF (SELECT count(DISTINCT id) FROM unnest(chosen) id)<>cardinality(chosen) THEN RAISE EXCEPTION 'Select each receipt once'; END IF;
  SELECT * INTO old_approval FROM public.stock_intake_batch_approvals WHERE id=b.approval_id;
  IF old_approval.id IS NOT NULL AND old_approval.actor_id=actor.id AND old_approval.revision=b.revision AND old_approval.manifest->'selection'=selection THEN RETURN jsonb_build_object('batch',to_jsonb(b),'approval_id',old_approval.id); END IF;
  IF EXISTS(SELECT 1 FROM public.stock_intake_jobs WHERE batch_id=b.id AND status IN('queued','running')) THEN RAISE EXCEPTION 'Wait for current work before approving a new manifest'; END IF;
  IF EXISTS(SELECT 1 FROM public.stock_intake_sources WHERE batch_id=b.id AND NOT excluded AND status<>'prepared') THEN RAISE EXCEPTION 'Include only fully prepared sources or explicitly exclude them'; END IF;
  IF (SELECT count(*) FROM public.stock_intake_groups WHERE id=ANY(chosen) AND batch_id=b.id AND status='ready' AND NOT excluded)<>cardinality(chosen)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection) v JOIN public.stock_intake_groups g ON g.id=(v->>'group_id')::uuid WHERE g.prepared_hash IS DISTINCT FROM v->>'hash') THEN RAISE EXCEPTION 'Receipt review changed; refresh the complete summary'; END IF;
  IF EXISTS(SELECT 1 FROM public.stock_intake_groups g JOIN public.stock_intakes i ON i.id=g.receipt_id WHERE g.id=ANY(chosen) AND i.document->>'currency' IS DISTINCT FROM (SELECT currency FROM public.organizations WHERE id=b.organization_id)) THEN RAISE EXCEPTION 'Business currency changed; prepare and review the receipts again'; END IF;
  IF EXISTS(SELECT 1 FROM public.stock_intake_groups g JOIN public.stock_intakes i ON i.id=g.receipt_id WHERE g.id=ANY(chosen) AND i.invoice_fingerprint IS NOT NULL
   GROUP BY i.invoice_fingerprint HAVING count(*)>1 AND bool_or(length(btrim(g.duplicate_reason))<8)) THEN RAISE EXCEPTION 'Repeated invoice identities need an acknowledgment reason on each selected receipt'; END IF;
  IF b.mode='opening_stock' AND EXISTS(SELECT 1 FROM public.stock_intake_groups g JOIN public.stock_intakes i ON i.id=g.receipt_id,
   jsonb_array_elements(i.document->'lines') line WHERE g.id=ANY(chosen) GROUP BY g.warehouse_id,COALESCE(line->>'product_id',line->'new_product'->>'draft_id') HAVING count(DISTINCT g.id)>1) THEN RAISE EXCEPTION 'Merge opening receipts that share a product/location before approving'; END IF;
  SELECT jsonb_agg(track_private.stock_batch_approve_group(id) ORDER BY id) INTO approved_receipts FROM public.stock_intake_groups WHERE id=ANY(chosen);
  manifest:=jsonb_build_object('selection',selection,'receipts',approved_receipts,
   'sources',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'sha256',sha256,'version',version,'excluded',excluded,'status',status) ORDER BY id),'[]') FROM public.stock_intake_sources WHERE batch_id=b.id),
   'excluded_receipts',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'status',status,'excluded',excluded) ORDER BY id),'[]') FROM public.stock_intake_groups WHERE batch_id=b.id AND id<>ALL(chosen)));
  identifier:=(command->>'approval_id')::uuid;
  INSERT INTO public.stock_intake_batch_approvals(id,organization_id,batch_id,actor_id,revision,manifest,payload_hash)
   VALUES(identifier,b.organization_id,b.id,actor.id,b.revision,manifest,encode(public.digest(manifest::text,'sha256'),'hex'));
  UPDATE public.stock_intake_batches SET approval_id=identifier,status='posting',updated_at=now() WHERE id=b.id;
  INSERT INTO public.stock_intake_jobs(organization_id,batch_id,actor_id,stage,group_id,content_revision,approval_id,job_key)
   SELECT b.organization_id,b.id,actor.id,'post',id,revision,identifier,b.id::text||':post:'||id::text||':'||revision||':'||identifier::text FROM public.stock_intake_groups WHERE id=ANY(chosen);
  UPDATE public.stock_intake_groups SET status='posting',error=NULL WHERE id=ANY(chosen);
 ELSIF action='retry' THEN
  -- Completed stock effects are never requeued. Post jobs retain their recorded actor.
  UPDATE public.stock_intake_jobs SET status='queued',attempts=0,run_after=now(),lease_until=NULL,error=NULL,
   actor_id=CASE WHEN stage='post' THEN actor_id ELSE actor.id END WHERE batch_id=b.id AND status='failed' AND NOT permanent
    AND (group_id IS NULL OR EXISTS(SELECT 1 FROM public.stock_intake_groups g WHERE g.id=group_id AND g.status<>'posted'))
    AND (stage<>'post' OR approval_id=b.approval_id);
  UPDATE public.stock_intake_sources src SET status='queued',error=NULL WHERE src.batch_id=b.id AND EXISTS(SELECT 1 FROM public.stock_intake_jobs j WHERE j.source_id=src.id AND j.status='queued');
  UPDATE public.stock_intake_groups g SET status=CASE WHEN EXISTS(SELECT 1 FROM public.stock_intake_jobs j WHERE j.group_id=g.id AND j.stage='post' AND j.status='queued') THEN 'posting' ELSE 'preparing' END,error=NULL
   WHERE g.batch_id=b.id AND g.status<>'posted' AND EXISTS(SELECT 1 FROM public.stock_intake_jobs j WHERE j.group_id=g.id AND j.status='queued');
 ELSIF action='cancel' THEN
  UPDATE public.stock_intake_jobs SET status='cancelled',lease_until=NULL WHERE batch_id=b.id AND status IN('queued','running');
  UPDATE public.stock_intakes SET status='draft',approval_id=NULL WHERE batch_id=b.id AND status<>'posted';
  UPDATE public.stock_intake_batches SET status='cancelled',approval_id=NULL,revision=revision+1,updated_at=now() WHERE id=b.id;
 ELSE RAISE EXCEPTION 'Unknown batch action'; END IF;
 INSERT INTO public.stock_intake_batch_changes(organization_id,batch_id,actor_id,kind,affected,after_value)
  VALUES(b.organization_id,b.id,actor.id,action,COALESCE(to_jsonb(chosen),'[]'),jsonb_build_object('source_id',command->'source_id','approval_id',command->'approval_id'));
 PERFORM track_private.stock_batch_refresh(b.id);
 RETURN jsonb_build_object('batch',(SELECT to_jsonb(current) FROM public.stock_intake_batches current WHERE id=b.id));
END $$;
REVOKE ALL ON FUNCTION public.stock_intake_batch_command(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stock_intake_batch_command(jsonb) TO authenticated;

CREATE FUNCTION public.stock_intake_job_command(command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='55s' AS $$
DECLARE job public.stock_intake_jobs; b public.stock_intake_batches; g public.stock_intake_groups; s public.stock_intake_sources;
 approval public.stock_intake_batch_approvals; selected jsonb; output jsonb; action text:=command->>'action'; previous_sub text; message text; state text; is_permanent boolean;
BEGIN
 IF jsonb_typeof(command) IS DISTINCT FROM 'object' OR pg_column_size(command)>4194304 THEN RAISE EXCEPTION 'Bounded worker command required'; END IF;
 IF action='claim' THEN RETURN track_private.stock_batch_claim(command->>'worker_id'); END IF;
 SELECT * INTO job FROM public.stock_intake_jobs WHERE id=(command->>'job_id')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job unavailable'; END IF;
 -- Consistent order with merchant edits/cancellation; claims skip busy batches.
 SELECT * INTO b FROM public.stock_intake_batches WHERE id=job.batch_id FOR UPDATE;
 SELECT * INTO job FROM public.stock_intake_jobs WHERE id=job.id FOR UPDATE;
 IF job.status='done' AND job.lease_token=(command->>'lease_token')::uuid AND job.processing_version=(command->>'processing_version')::integer THEN
  RETURN jsonb_build_object('ok',true,'result',job.result,'already_completed',true);
 END IF;
 job:=track_private.stock_batch_lease(command,action<>'fail');
 IF action='heartbeat' THEN
  UPDATE public.stock_intake_jobs SET lease_until=clock_timestamp()+interval '120 seconds' WHERE id=job.id;
  UPDATE public.stock_intake_sources SET status='parsing' WHERE id=job.source_id AND job.stage='parse';
  RETURN jsonb_build_object('ok',true);
 END IF;
 IF action='waiting_upload' THEN
  IF job.stage<>'inspect' THEN RAISE EXCEPTION 'Only unfinished uploads can wait'; END IF;
  SELECT * INTO s FROM public.stock_intake_sources WHERE id=job.source_id;
  IF s.upload_expires_at>clock_timestamp() THEN
   UPDATE public.stock_intake_jobs SET status='queued',attempts=greatest(attempts-1,0),lease_until=NULL,run_after=clock_timestamp()+interval '10 seconds',result=jsonb_build_object('waiting_upload',true) WHERE id=job.id;
   UPDATE public.stock_intake_sources SET status='uploading' WHERE id=s.id;
   RETURN jsonb_build_object('ok',true,'waiting_upload',true);
  END IF;
  command:=command||jsonb_build_object('action','fail','error','Upload session expired before a complete file was received','permanent',true);
  action:='fail';
 END IF;
 BEGIN
  IF action='fail' THEN
   message:=left(COALESCE(command->>'error','Processing failed'),2000);
   is_permanent:=COALESCE((command->>'permanent')::boolean,false);
  ELSIF action='checkpoint' THEN
   output:=track_private.stock_batch_checkpoint(job,command->'rows');
   RETURN jsonb_build_object('ok',true,'result',output);
  ELSIF action='file_received' THEN
   IF job.stage<>'inspect' THEN RAISE EXCEPTION 'Incorrect processing stage'; END IF;
   SELECT * INTO s FROM public.stock_intake_sources WHERE id=job.source_id;
   IF command->>'sha256' IS DISTINCT FROM s.sha256 OR (command->>'bytes')::bigint IS DISTINCT FROM s.bytes THEN RAISE EXCEPTION 'Uploaded bytes/hash do not match the authorized session'; END IF;
   UPDATE public.stock_intake_sources SET status='inspecting' WHERE id=s.id;
   RETURN jsonb_build_object('ok',true);
  ELSIF action='inspect' THEN
   IF job.stage<>'inspect' THEN RAISE EXCEPTION 'Incorrect processing stage'; END IF;
   SELECT * INTO s FROM public.stock_intake_sources WHERE id=job.source_id;
   IF command->>'sha256' IS DISTINCT FROM s.sha256 OR (command->>'bytes')::bigint IS DISTINCT FROM s.bytes
    OR jsonb_typeof(command->'inspection'->'sheets') IS DISTINCT FROM 'array' OR jsonb_array_length(command->'inspection'->'sheets')<1 THEN RAISE EXCEPTION 'Uploaded bytes/hash or workbook inspection does not match its authorized session'; END IF;
   UPDATE public.stock_intake_sources SET inspection=command->'inspection',verified_at=now(),status='select_sheets',error=NULL WHERE id=s.id;
   output:=jsonb_build_object('verified',true,'worksheets',jsonb_array_length(command->'inspection'->'sheets'));
  ELSIF action='parsed' THEN
   IF job.stage<>'parse' THEN RAISE EXCEPTION 'Incorrect processing stage'; END IF;
   SELECT * INTO s FROM public.stock_intake_sources WHERE id=job.source_id;
   IF (command->'stats'->>'prepared')::integer IS DISTINCT FROM (SELECT count(*)::integer FROM public.stock_intake_batch_rows WHERE source_id=s.id AND version=s.version)
    OR (command->'stats'->>'prepared')::integer NOT BETWEEN 1 AND 20000
    OR jsonb_array_length(command->'stats'->'worksheets') IS DISTINCT FROM jsonb_array_length(s.plan->'sheets') THEN RAISE EXCEPTION 'Prepared row or worksheet coverage is incomplete'; END IF;
   UPDATE public.stock_intake_sources SET stats=command->'stats',status='prepared',error=NULL WHERE id=s.id;
   output:=command->'stats';
  ELSIF action='prepare' THEN
   IF job.stage<>'prepare' THEN RAISE EXCEPTION 'Incorrect processing stage'; END IF;
   output:=track_private.stock_batch_prepare(job);
  ELSIF action='post' THEN
   IF job.stage<>'post' THEN RAISE EXCEPTION 'Incorrect processing stage'; END IF;
   SELECT * INTO approval FROM public.stock_intake_batch_approvals WHERE id=job.approval_id AND batch_id=b.id;
   SELECT * INTO g FROM public.stock_intake_groups WHERE id=job.group_id FOR UPDATE;
   SELECT value INTO selected FROM jsonb_array_elements(approval.manifest->'receipts') WHERE value->>'group_id'=g.id::text;
   IF approval.id IS NULL OR approval.id IS DISTINCT FROM b.approval_id OR approval.actor_id<>job.actor_id OR approval.revision<>b.revision
    OR encode(public.digest(approval.manifest::text,'sha256'),'hex')<>approval.payload_hash OR selected IS NULL
    OR selected->>'hash' IS DISTINCT FROM g.prepared_hash OR selected->>'receipt_id' IS DISTINCT FROM g.receipt_id::text THEN RAISE EXCEPTION 'Recorded batch approval changed; renewed review required'; END IF;
   previous_sub:=current_setting('request.jwt.claim.sub',true);
   PERFORM set_config('request.jwt.claim.sub',approval.actor_id::text,true);
   INSERT INTO track_private.stock_intake_batch_context(backend,transaction_id,batch_id,group_id) VALUES(pg_backend_pid(),txid_current(),b.id,g.id);
   output:=public.post_stock_intake(g.receipt_id,(selected->>'approval_id')::uuid);
   DELETE FROM track_private.stock_intake_batch_context WHERE backend=pg_backend_pid() AND transaction_id=txid_current();
   PERFORM set_config('request.jwt.claim.sub',COALESCE(previous_sub,''),true);
   UPDATE public.stock_intake_groups SET status='posted',error=NULL WHERE id=g.id;
  ELSE RAISE EXCEPTION 'Unknown worker action'; END IF;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT,state=RETURNED_SQLSTATE;
  is_permanent:=state NOT IN('40001','40P01','53300','53400');
 END;
 IF message IS NOT NULL THEN
  UPDATE public.stock_intake_jobs SET status=CASE WHEN NOT is_permanent AND attempts<3 THEN 'queued' ELSE 'failed' END,
   permanent=is_permanent,error=message,lease_until=NULL,run_after=clock_timestamp()+make_interval(secs=>5*attempts*attempts),
   attempt_log=attempt_log||jsonb_build_array(jsonb_build_object('attempt',attempts,'processing_version',processing_version,'error',message,'permanent',is_permanent,'at',now())) WHERE id=job.id RETURNING * INTO job;
  IF job.status='failed' THEN
   UPDATE public.stock_intake_sources SET status='failed',error=message WHERE id=job.source_id AND version=job.content_revision;
   UPDATE public.stock_intake_groups SET status='needs_review',error=message WHERE id=job.group_id AND status<>'posted';
  END IF;
  PERFORM track_private.stock_batch_refresh(b.id);
  RETURN jsonb_build_object('ok',false,'error',message,'permanent',is_permanent,'status',job.status);
 END IF;
 UPDATE public.stock_intake_jobs SET status='done',result=output,error=NULL,lease_until=NULL WHERE id=job.id;
 PERFORM track_private.stock_batch_refresh(b.id);
 RETURN jsonb_build_object('ok',true,'result',output);
END $$;
REVOKE ALL ON FUNCTION public.stock_intake_job_command(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stock_intake_job_command(jsonb) TO service_role;
COMMIT;
