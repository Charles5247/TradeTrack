-- Owners retain organization-wide access. Staff see only their assigned
-- locations and products stocked there (including zero-stock rows for restock).
CREATE INDEX IF NOT EXISTS inventory_org_product_warehouse_scope_idx
  ON public.inventory (organization_id, product_id, warehouse_id);

CREATE POLICY staff_warehouse_select_scope ON public.warehouses
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    COALESCE((SELECT public.get_user_role()) NOT IN ('admin','cashier'), false)
    OR EXISTS (
      SELECT 1 FROM public.warehouse_staff ws
      WHERE ws.organization_id = warehouses.organization_id
        AND ws.warehouse_id = warehouses.id
        AND ws.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY staff_inventory_scope ON public.inventory
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (
    COALESCE((SELECT public.get_user_role()) NOT IN ('admin','cashier'), false)
    OR EXISTS (
      SELECT 1 FROM public.warehouse_staff ws
      WHERE ws.organization_id = inventory.organization_id
        AND ws.warehouse_id = inventory.warehouse_id
        AND ws.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    COALESCE((SELECT public.get_user_role()) NOT IN ('admin','cashier'), false)
    OR EXISTS (
      SELECT 1 FROM public.warehouse_staff ws
      WHERE ws.organization_id = inventory.organization_id
        AND ws.warehouse_id = inventory.warehouse_id
        AND ws.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY staff_product_select_scope ON public.products
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    COALESCE((SELECT public.get_user_role()) NOT IN ('admin','cashier'), false)
    OR EXISTS (
      SELECT 1 FROM public.inventory i
      JOIN public.warehouse_staff ws
        ON ws.organization_id = i.organization_id
       AND ws.warehouse_id = i.warehouse_id
      WHERE i.organization_id = products.organization_id
        AND i.product_id = products.id
        AND ws.user_id = (SELECT auth.uid())
    )
  );

-- The costed stock receipt is SECURITY DEFINER and bypasses table RLS, so
-- check the manager's location assignment explicitly before changing stock.
CREATE OR REPLACE FUNCTION public.receive_stock_at_cost(
  p_receipt_id uuid, p_product_id uuid, p_warehouse_id uuid,
  p_quantity integer, p_unit_cost numeric, p_notes text DEFAULT NULL
) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor public.users;
  existing public.product_cost_history;
  product_org uuid;
  warehouse_org uuid;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = auth.uid() AND status = 'active';
  IF actor.id IS NULL OR actor.role NOT IN ('business_owner', 'admin') THEN
    RAISE EXCEPTION 'Only the business owner or manager can receive stock';
  END IF;
  IF actor.role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.warehouse_staff ws
    WHERE ws.organization_id = actor.organization_id
      AND ws.warehouse_id = p_warehouse_id AND ws.user_id = actor.id
  ) THEN RAISE EXCEPTION 'You are not assigned to this warehouse'; END IF;
  IF p_receipt_id IS NULL OR p_quantity <= 0 OR p_unit_cost IS NULL OR p_unit_cost < 0
     OR p_unit_cost > 9999999999.99 THEN RAISE EXCEPTION 'Invalid stock receipt'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_receipt_id::text, 0));
  SELECT * INTO existing FROM public.product_cost_history WHERE source_id = p_receipt_id;
  IF existing.id IS NOT NULL THEN
    IF existing.organization_id <> actor.organization_id OR existing.product_id <> p_product_id
       OR existing.warehouse_id <> p_warehouse_id OR existing.received_quantity <> p_quantity
       OR existing.unit_cost <> p_unit_cost THEN RAISE EXCEPTION 'Receipt ID was already used'; END IF;
    RETURN existing.new_average_cost;
  END IF;
  SELECT organization_id INTO product_org FROM public.products WHERE id = p_product_id;
  SELECT organization_id INTO warehouse_org FROM public.warehouses WHERE id = p_warehouse_id;
  IF product_org IS DISTINCT FROM actor.organization_id OR warehouse_org IS DISTINCT FROM actor.organization_id THEN
    RAISE EXCEPTION 'Product and location must belong to your business';
  END IF;
  RETURN track_private.apply_purchase_cost_receipt(actor.organization_id,
    p_product_id, p_warehouse_id, NULL, p_receipt_id, p_quantity,
    p_unit_cost, actor.id, false, p_notes);
END $$;
REVOKE ALL ON FUNCTION public.receive_stock_at_cost(uuid,uuid,uuid,integer,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_stock_at_cost(uuid,uuid,uuid,integer,numeric,text) TO authenticated;
