BEGIN;

-- The application activates this service-only workflow independently from
-- receipt approval. No browser role has table access or can call the writer.
CREATE TABLE track_private.ai_product_price_operations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- These are historical identities. Preparation verifies the links, and
  -- approval rechecks the live product so the ledger cannot block cleanup.
  owner_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  job_id uuid NOT NULL,
  row_index integer NOT NULL CHECK (row_index >= 0),
  product_id uuid NOT NULL,
  product_name text NOT NULL,
  product_version text NOT NULL,
  old_price_minor bigint NOT NULL CHECK (old_price_minor BETWEEN 0 AND 999999999999),
  new_price_minor bigint NOT NULL CHECK (new_price_minor BETWEEN 0 AND 999999999999),
  review_digest text NOT NULL CHECK (review_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'completed', 'conflict', 'expired')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (old_price_minor <> new_price_minor),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

ALTER TABLE track_private.ai_product_price_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON track_private.ai_product_price_operations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION track_private.manage_ai_price_change(
  p_actor_id uuid, p_organization_id uuid, p_action text, p_operation_id uuid,
  p_job_id uuid, p_row_index integer, p_new_price_minor bigint, p_review_digest text,
  p_access_until timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  operation track_private.ai_product_price_operations;
  receipt public.ai_stock_receipts;
  product public.products;
  product_version text;
  old_price_minor bigint;
  reviewed_until timestamptz;
  digest text;
  ttl text;
  original_sub text;
  original_claims text;
  eligible_until timestamptz;
BEGIN
  IF p_operation_id IS NULL OR p_action IS NULL OR p_action NOT IN ('prepare', 'approve', 'status') THEN
    RAISE EXCEPTION 'PRICE_INVALID';
  END IF;

  -- Identity comes only from the server's authenticated, entitled context.
  -- Lock membership for the duration so a revocation cannot race the effect.
  PERFORM 1 FROM public.users
    WHERE id = p_actor_id AND organization_id = p_organization_id
      AND role = 'business_owner' AND status = 'active'
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_FORBIDDEN'; END IF;

  IF p_action <> 'status' THEN
    IF p_access_until IS NULL OR p_access_until <= clock_timestamp() THEN
      RAISE EXCEPTION 'PRICE_FORBIDDEN';
    END IF;

    -- Only this service-role RPC delegates the verified actor. Preserve the
    -- service role and restore both claim representations before doing work.
    -- Stock review's policy locks membership, organization and subscriptions
    -- in their existing order, then checks the current plan and expiry.
    original_sub := current_setting('request.jwt.claim.sub', true);
    original_claims := current_setting('request.jwt.claims', true);
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', p_actor_id::text, true);
      PERFORM set_config('request.jwt.claims', jsonb_set(
        COALESCE(NULLIF(original_claims, '')::jsonb, '{}'::jsonb), '{sub}', to_jsonb(p_actor_id)
      )::text, true);
      PERFORM track_private.stock_review_actor(true);
      eligible_until := (public.verify_business_subscription()->>'valid_until')::timestamptz;
      PERFORM set_config('request.jwt.claim.sub', COALESCE(original_sub, ''), true);
      PERFORM set_config('request.jwt.claims', COALESCE(original_claims, ''), true);
    EXCEPTION WHEN raise_exception THEN
      -- PostgreSQL rolls the local claim changes back before entering a handler.
      IF SQLERRM LIKE 'STOCK_REVIEW_FORBIDDEN:%'
        OR SQLERRM IN ('AI requires the introductory period or Growth and above',
          'Business owner required', 'Authentication required', 'Business membership required') THEN
        RAISE EXCEPTION 'PRICE_FORBIDDEN';
      END IF;
      RAISE;
    END;
    IF eligible_until IS NULL OR eligible_until <= clock_timestamp() THEN
      RAISE EXCEPTION 'PRICE_FORBIDDEN';
    END IF;
  END IF;

  SELECT settings->>'ai_stock_review_ttl_seconds' INTO ttl FROM public.organizations
    WHERE id = p_organization_id AND currency = 'NGN' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_FORBIDDEN'; END IF;

  IF p_action = 'prepare' THEN
    IF p_job_id IS NULL OR p_row_index IS NULL OR p_row_index < 0
      OR p_new_price_minor IS NULL OR p_new_price_minor NOT BETWEEN 0 AND 999999999999 THEN
      RAISE EXCEPTION 'PRICE_INVALID';
    END IF;
  ELSIF p_action = 'approve' AND (p_review_digest IS NULL OR p_review_digest !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'PRICE_INVALID';
  END IF;

  SELECT * INTO operation FROM track_private.ai_product_price_operations WHERE id = p_operation_id FOR UPDATE;
  IF FOUND AND (operation.organization_id IS DISTINCT FROM p_organization_id
      OR operation.owner_id IS DISTINCT FROM p_actor_id) THEN
    RAISE EXCEPTION 'PRICE_NOT_FOUND';
  END IF;

  IF p_action = 'prepare' THEN
    IF operation.id IS NULL THEN
      SELECT r.* INTO receipt FROM public.ai_stock_receipts r
        JOIN public.ai_jobs j ON j.id = r.job_id AND j.organization_id = r.organization_id
        WHERE r.job_id = p_job_id AND r.row_index = p_row_index
          AND r.organization_id = p_organization_id AND r.approved_by = p_actor_id
          AND j.user_id = p_actor_id AND j.kind = 'inventory' AND r.created_product = false
          AND r.approval_id IS NOT NULL AND r.operation_id IS NOT NULL AND r.review_digest IS NOT NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_NOT_FOUND'; END IF;

      SELECT p.xmin::text INTO product_version FROM public.products p
        WHERE p.id = receipt.product_id AND p.organization_id = p_organization_id AND p.status = 'active'
        FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRICE_NOT_FOUND'; END IF;
      IF LEAST(p_access_until, eligible_until) <= clock_timestamp() THEN RAISE EXCEPTION 'PRICE_FORBIDDEN'; END IF;
      SELECT * INTO STRICT product FROM public.products WHERE id = receipt.product_id;
      old_price_minor := (product.selling_price * 100)::bigint;
      IF old_price_minor = p_new_price_minor THEN RAISE EXCEPTION 'PRICE_UNCHANGED'; END IF;
      IF ttl IS NULL OR ttl !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION 'PRICE_NOT_CONFIGURED'; END IF;
      IF ttl::integer NOT BETWEEN 60 AND 3600 THEN RAISE EXCEPTION 'PRICE_NOT_CONFIGURED'; END IF;
      reviewed_until := clock_timestamp() + make_interval(secs => ttl::integer);
      digest := encode(sha256(convert_to(jsonb_build_array(
        p_operation_id, p_actor_id, p_organization_id, receipt.id, p_job_id, p_row_index,
        product.id, product_version, old_price_minor, p_new_price_minor, reviewed_until
      )::text, 'UTF8')), 'hex');

      INSERT INTO track_private.ai_product_price_operations (
        id, organization_id, owner_id, receipt_id, job_id, row_index,
        product_id, product_name, product_version, old_price_minor,
        new_price_minor, review_digest, expires_at
      ) VALUES (
        p_operation_id, p_organization_id, p_actor_id, receipt.id, p_job_id, p_row_index,
        product.id, product.name, product_version, old_price_minor,
        p_new_price_minor, digest, reviewed_until
      ) ON CONFLICT (id) DO NOTHING;
      SELECT * INTO STRICT operation FROM track_private.ai_product_price_operations
        WHERE id = p_operation_id FOR UPDATE;
      IF operation.organization_id IS DISTINCT FROM p_organization_id
        OR operation.owner_id IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'PRICE_NOT_FOUND';
      END IF;
    END IF;

    IF ROW(operation.job_id, operation.row_index, operation.new_price_minor)
       IS DISTINCT FROM ROW(p_job_id, p_row_index, p_new_price_minor) THEN
      RAISE EXCEPTION 'PRICE_PAYLOAD_CHANGED';
    END IF;
  ELSIF operation.id IS NULL THEN
    RAISE EXCEPTION 'PRICE_NOT_FOUND';
  ELSIF p_action = 'approve' THEN
    IF operation.review_digest IS DISTINCT FROM p_review_digest THEN
      RAISE EXCEPTION 'PRICE_PAYLOAD_CHANGED';
    END IF;
    IF operation.status = 'prepared' THEN
      SELECT p.xmin::text INTO product_version FROM public.products p
        WHERE p.id = operation.product_id AND p.organization_id = p_organization_id AND p.status = 'active'
        FOR UPDATE;

      IF LEAST(p_access_until, eligible_until) <= clock_timestamp() THEN RAISE EXCEPTION 'PRICE_FORBIDDEN'; END IF;
      IF operation.expires_at <= clock_timestamp() THEN
        UPDATE track_private.ai_product_price_operations SET status = 'expired'
          WHERE id = operation.id RETURNING * INTO operation;
      ELSIF product_version IS DISTINCT FROM operation.product_version THEN
        UPDATE track_private.ai_product_price_operations SET status = 'conflict'
          WHERE id = operation.id RETURNING * INTO operation;
      ELSE
        UPDATE public.products SET selling_price = operation.new_price_minor::numeric / 100,
          updated_at = clock_timestamp()
          WHERE id = operation.product_id AND organization_id = p_organization_id
            AND selling_price = operation.old_price_minor::numeric / 100;
        IF NOT FOUND THEN
          UPDATE track_private.ai_product_price_operations SET status = 'conflict'
            WHERE id = operation.id RETURNING * INTO operation;
        ELSE
          INSERT INTO public.audit_logs (
            organization_id, user_id, action, resource_type, resource_id, old_values, new_values, reason, correlation_id
          ) VALUES (
            p_organization_id, p_actor_id, 'AI_PRODUCT_PRICE_APPROVED', 'product', operation.product_id,
            jsonb_build_object('selling_price_minor', operation.old_price_minor::text),
            jsonb_build_object('selling_price_minor', operation.new_price_minor::text,
              'job_id', operation.job_id, 'receipt_id', operation.receipt_id,
              'review_digest', operation.review_digest),
            'Business Owner approved the exact existing-product selling price', operation.id
          );
          UPDATE track_private.ai_product_price_operations SET status = 'completed', completed_at = clock_timestamp()
            WHERE id = operation.id RETURNING * INTO operation;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'operationId', operation.id, 'job', operation.job_id, 'rowIndex', operation.row_index,
    'productId', operation.product_id, 'productName', operation.product_name,
    'oldPriceMinor', operation.old_price_minor::text, 'newPriceMinor', operation.new_price_minor::text,
    'reviewDigest', operation.review_digest,
    'status', CASE WHEN operation.status = 'prepared' AND operation.expires_at <= clock_timestamp()
      THEN 'expired' ELSE operation.status END,
    'expiresAt', operation.expires_at, 'completedAt', operation.completed_at
  );
END $$;

CREATE FUNCTION public.manage_ai_price_change(
  p_actor_id uuid, p_organization_id uuid, p_action text, p_operation_id uuid,
  p_job_id uuid DEFAULT NULL, p_row_index integer DEFAULT NULL,
  p_new_price_minor bigint DEFAULT NULL, p_review_digest text DEFAULT NULL,
  p_access_until timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT track_private.manage_ai_price_change(
    p_actor_id, p_organization_id, p_action, p_operation_id,
    p_job_id, p_row_index, p_new_price_minor, p_review_digest, p_access_until
  )
$$;

REVOKE ALL ON FUNCTION track_private.manage_ai_price_change(uuid, uuid, text, uuid, uuid, integer, bigint, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manage_ai_price_change(uuid, uuid, text, uuid, uuid, integer, bigint, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA track_private TO service_role;
GRANT EXECUTE ON FUNCTION track_private.manage_ai_price_change(uuid, uuid, text, uuid, uuid, integer, bigint, text, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_ai_price_change(uuid, uuid, text, uuid, uuid, integer, bigint, text, timestamptz)
  TO service_role;

COMMIT;
