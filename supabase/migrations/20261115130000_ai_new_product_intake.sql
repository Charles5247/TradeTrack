-- Owner-approved new products share the same per-job row command identity as
-- existing-product receipts. Product creation and stock receipt commit together.
ALTER TABLE public.ai_stock_receipts
  ADD COLUMN created_product boolean NOT NULL DEFAULT false,
  ADD COLUMN approved_product jsonb;

CREATE FUNCTION public.apply_ai_new_product_receipt(
  p_job_id uuid, p_row_index integer, p_name text, p_sku text,
  p_stock_unit text, p_selling_price numeric, p_warehouse_id uuid,
  p_quantity integer, p_unit_cost numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor public.users;
  job public.ai_jobs;
  prior public.ai_stock_receipts;
  product_id uuid;
  product_limit integer;
  current_products integer;
  normalized_name text := pg_catalog.btrim(p_name);
  normalized_sku text := pg_catalog.btrim(p_sku);
  product_details jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = (SELECT auth.uid()) AND status = 'active';
  IF actor.id IS NULL OR actor.role <> 'business_owner'
     OR track_private.assert_ai_access() IS DISTINCT FROM actor.organization_id THEN
    RAISE EXCEPTION 'Only an entitled business owner can approve AI product creation';
  END IF;
  IF p_row_index IS NULL OR p_row_index < 0 OR p_job_id IS NULL
     OR normalized_name IS NULL OR pg_catalog.length(normalized_name) NOT BETWEEN 1 AND 255
     OR normalized_sku IS NULL OR pg_catalog.length(normalized_sku) NOT BETWEEN 1 AND 100
     OR p_stock_unit IS NULL OR p_stock_unit <> ALL(ARRAY[
       'piece','pair','pack','carton','bag','g','kg','mL','L','cm','m',
       'yard','bale','bundle','roll','dozen','set','tablet','bottle','vial'])
     OR p_selling_price IS NULL OR p_selling_price < 0 OR p_selling_price > 9999999999.99
     OR p_quantity IS NULL OR p_quantity <= 0 OR p_unit_cost IS NULL
     OR p_unit_cost < 0 OR p_unit_cost > 9999999999.99 THEN
    RAISE EXCEPTION 'Enter a valid name, SKU, unit, selling price, quantity and buying cost';
  END IF;
  SELECT * INTO job FROM public.ai_jobs
    WHERE id = p_job_id AND organization_id = actor.organization_id
      AND user_id = actor.id AND kind = 'inventory' AND status = 'ready';
  IF job.id IS NULL OR pg_catalog.jsonb_typeof(job.result->'rows'->p_row_index) <> 'object' THEN
    RAISE EXCEPTION 'Ready source row not found in your stock proposal';
  END IF;
  product_details := pg_catalog.jsonb_build_object('name', normalized_name, 'sku', normalized_sku,
    'stock_unit', p_stock_unit, 'selling_price', p_selling_price);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_job_id::text || ':' || p_row_index::text, 0));
  SELECT * INTO prior FROM public.ai_stock_receipts WHERE job_id = p_job_id AND row_index = p_row_index;
  IF prior.id IS NOT NULL THEN
    IF NOT prior.created_product OR prior.organization_id <> actor.organization_id
       OR prior.approved_by <> actor.id OR prior.approved_product IS DISTINCT FROM product_details
       OR prior.warehouse_id <> p_warehouse_id OR prior.quantity <> p_quantity
       OR prior.unit_cost <> p_unit_cost THEN
      RAISE EXCEPTION 'This proposal row was already applied with different changes';
    END IF;
    RETURN prior.product_id;
  END IF;
  -- Also serialize concurrent create attempts for the same merchant/SKU.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor.organization_id::text || ':' || pg_catalog.lower(normalized_sku), 1));
  IF EXISTS (SELECT 1 FROM public.products WHERE organization_id = actor.organization_id
      AND (pg_catalog.lower(sku) = pg_catalog.lower(normalized_sku)
        OR pg_catalog.lower(name) = pg_catalog.lower(normalized_name))) THEN
    RAISE EXCEPTION 'A product with this name or SKU already exists; match it instead';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id
      AND organization_id = actor.organization_id) THEN
    RAISE EXCEPTION 'Choose a warehouse in your business';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor.organization_id::text || ':ai_product_limit', 2));
  SELECT CASE WHEN s.status = 'trial' THEN 1500 ELSE sp.max_products END
    INTO product_limit
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON sp.id = s.plan_id
    WHERE s.organization_id = actor.organization_id
    ORDER BY s.created_at DESC, s.id DESC LIMIT 1;
  SELECT pg_catalog.count(*) INTO current_products FROM public.products
    WHERE organization_id = actor.organization_id;
  IF product_limit IS NOT NULL AND product_limit <> -1
     AND current_products >= product_limit THEN
    RAISE EXCEPTION 'Your plan product limit has been reached';
  END IF;
  product_id := pg_catalog.md5(p_job_id::text || ':' || p_row_index::text || ':product')::uuid;
  INSERT INTO public.products
    (id, organization_id, name, sku, stock_unit, selling_price, cost_price, created_by)
  VALUES (product_id, actor.organization_id, normalized_name, normalized_sku,
    p_stock_unit, p_selling_price, 0, actor.id);
  PERFORM public.apply_ai_stock_receipt(p_job_id, p_row_index, product_id,
    p_warehouse_id, p_quantity, p_unit_cost);
  UPDATE public.ai_stock_receipts SET created_product = true, approved_product = product_details
    WHERE job_id = p_job_id AND row_index = p_row_index;
  INSERT INTO public.audit_logs
    (organization_id, user_id, action, resource_type, resource_id, new_values, correlation_id)
  VALUES (actor.organization_id, actor.id, 'AI_EXECUTED', 'products', product_id,
    product_details || pg_catalog.jsonb_build_object('job_id', p_job_id,
      'row_index', p_row_index), p_job_id);
  RETURN product_id;
END $$;
REVOKE ALL ON FUNCTION public.apply_ai_new_product_receipt(uuid,integer,text,text,text,numeric,uuid,integer,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_ai_new_product_receipt(uuid,integer,text,text,text,numeric,uuid,integer,numeric) TO authenticated;
