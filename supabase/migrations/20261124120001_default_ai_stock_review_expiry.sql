BEGIN;

-- A missing stock review policy uses a 10-minute server-side approval window.
-- Explicit values still have to pass the original bounded expiry validation.
CREATE OR REPLACE FUNCTION public.preview_ai_stock_selection(p_job_id uuid,p_revision integer,p_row_indices integer[],p_physical_received boolean)
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
  SELECT CASE WHEN settings ? 'ai_stock_review_ttl_seconds'
    THEN settings->>'ai_stock_review_ttl_seconds' ELSE '600' END
    INTO ttl FROM public.organizations WHERE id=job.organization_id;
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

COMMIT;
