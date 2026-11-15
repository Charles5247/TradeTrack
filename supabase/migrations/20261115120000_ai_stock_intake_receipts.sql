-- Each owner-approved AI row is an immutable command. A retry with the same
-- job and row returns its recorded result; changed effects require a new job.
CREATE TABLE public.ai_stock_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  job_id uuid NOT NULL REFERENCES public.ai_jobs(id),
  row_index integer NOT NULL CHECK (row_index >= 0),
  approved_by uuid NOT NULL REFERENCES public.users(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0 AND unit_cost <= 9999999999.99),
  average_cost numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, row_index)
);
CREATE INDEX ai_stock_receipts_org_job_idx ON public.ai_stock_receipts (organization_id, job_id);
ALTER TABLE public.ai_stock_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_stock_receipts_owner_read ON public.ai_stock_receipts
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.get_user_org_id()) AND approved_by = (SELECT auth.uid()));
GRANT SELECT ON public.ai_stock_receipts TO authenticated;

CREATE FUNCTION public.apply_ai_stock_receipt(
  p_job_id uuid, p_row_index integer, p_product_id uuid,
  p_warehouse_id uuid, p_quantity integer, p_unit_cost numeric
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor public.users;
  entitled_org uuid;
  job public.ai_jobs;
  prior public.ai_stock_receipts;
  receipt_id uuid;
  average_cost numeric;
  source_row jsonb;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = (SELECT auth.uid()) AND status = 'active';
  IF actor.id IS NULL OR actor.role <> 'business_owner' THEN
    RAISE EXCEPTION 'Only the business owner can approve AI stock receipts';
  END IF;
  entitled_org := track_private.assert_ai_access();
  IF entitled_org IS DISTINCT FROM actor.organization_id THEN
    RAISE EXCEPTION 'AI is not active for this business';
  END IF;
  IF p_row_index IS NULL OR p_row_index < 0 OR p_product_id IS NULL OR p_warehouse_id IS NULL
     OR p_quantity IS NULL OR p_quantity <= 0 OR p_unit_cost IS NULL
     OR p_unit_cost < 0 OR p_unit_cost > 9999999999.99 THEN
    RAISE EXCEPTION 'Invalid AI stock receipt';
  END IF;
  SELECT * INTO job FROM public.ai_jobs
    WHERE id = p_job_id AND organization_id = actor.organization_id
      AND user_id = actor.id AND kind = 'inventory' AND status = 'ready';
  IF job.id IS NULL THEN RAISE EXCEPTION 'Ready stock proposal not found'; END IF;
  source_row := job.result->'rows'->p_row_index;
  IF source_row IS NULL OR jsonb_typeof(source_row) <> 'object' THEN
    RAISE EXCEPTION 'Source row not found in stock proposal';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id
      AND organization_id = actor.organization_id AND medical_stock_managed = true) THEN
    RAISE EXCEPTION 'Use the medical stock workflow for this product';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_job_id::text || ':' || p_row_index::text, 0));
  SELECT * INTO prior FROM public.ai_stock_receipts
    WHERE job_id = p_job_id AND row_index = p_row_index;
  IF prior.id IS NOT NULL THEN
    IF prior.organization_id <> actor.organization_id OR prior.approved_by <> actor.id
       OR prior.product_id <> p_product_id OR prior.warehouse_id <> p_warehouse_id
       OR prior.quantity <> p_quantity OR prior.unit_cost <> p_unit_cost THEN
      RAISE EXCEPTION 'This proposal row was already applied with different stock changes';
    END IF;
    RETURN prior.average_cost;
  END IF;
  -- The receipt key is stable across retries and distinct from the source fingerprint.
  receipt_id := pg_catalog.md5(p_job_id::text || ':' || p_row_index::text)::uuid;
  average_cost := public.receive_stock_at_cost(receipt_id, p_product_id, p_warehouse_id,
    p_quantity, p_unit_cost, 'Owner approved AI stock proposal ' || p_job_id::text ||
    ', row ' || (p_row_index + 1)::text);
  INSERT INTO public.ai_stock_receipts
    (organization_id, job_id, row_index, approved_by, product_id, warehouse_id,
     quantity, unit_cost, average_cost)
  VALUES (actor.organization_id, p_job_id, p_row_index, actor.id, p_product_id,
    p_warehouse_id, p_quantity, p_unit_cost, average_cost);
  INSERT INTO public.audit_logs
    (organization_id, user_id, action, resource_type, resource_id, new_values, correlation_id)
  VALUES (actor.organization_id, actor.id, 'AI_EXECUTED', 'ai_stock_receipts',
    receipt_id, pg_catalog.jsonb_build_object('job_id', p_job_id, 'row_index', p_row_index,
    'product_id', p_product_id, 'warehouse_id', p_warehouse_id,
    'quantity', p_quantity, 'unit_cost', p_unit_cost), p_job_id);
  RETURN average_cost;
END $$;
REVOKE ALL ON FUNCTION public.apply_ai_stock_receipt(uuid,integer,uuid,uuid,integer,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_ai_stock_receipt(uuid,integer,uuid,uuid,integer,numeric) TO authenticated;
