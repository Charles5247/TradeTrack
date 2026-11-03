-- Apply each sale against the current server stock, once all of its items exist.
-- This avoids replaying a stale absolute inventory snapshot from an offline till.
BEGIN;

CREATE OR REPLACE FUNCTION public.apply_sale_stock(p_sale_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  sale_row public.sales;
  stock_row public.inventory;
  line record;
  applied integer := 0;
  line_count integer := 0;
BEGIN
  SELECT * INTO sale_row FROM public.sales WHERE id = p_sale_id;
  IF sale_row.id IS NULL OR sale_row.status <> 'completed' THEN
    RAISE EXCEPTION 'Completed sale not found';
  END IF;
  IF sale_row.organization_id IS DISTINCT FROM public.get_user_org_id()
     OR (sale_row.cashier_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin_or_above()) THEN
    RAISE EXCEPTION 'Sale stock access denied';
  END IF;

  FOR line IN
    SELECT product_id, warehouse_id, sum(quantity)::integer AS quantity
    FROM public.sale_items WHERE sale_id = p_sale_id
    GROUP BY product_id, warehouse_id
    ORDER BY product_id, warehouse_id
  LOOP
    line_count := line_count + 1;
    SELECT * INTO stock_row FROM public.inventory
      WHERE organization_id = sale_row.organization_id
        AND product_id = line.product_id AND warehouse_id = line.warehouse_id
      FOR UPDATE;
    IF stock_row.id IS NULL THEN RAISE EXCEPTION 'Sale inventory row is missing'; END IF;

    -- The existing stock ledger records successful legacy uploads. A retry
    -- must never reduce the same sale's stock a second time.
    IF EXISTS (
      SELECT 1 FROM public.inventory_movements m
      WHERE m.organization_id = sale_row.organization_id
        AND m.reference_type = 'inventory_ledger'
        AND m.reference_id = stock_row.id
        AND m.original_device_timestamp = sale_row.created_at
        AND m.quantity < 0
    ) THEN CONTINUE; END IF;

    IF line.quantity <= 0 OR stock_row.quantity < line.quantity THEN
      RAISE EXCEPTION 'Insufficient current stock for sale %; review inventory', p_sale_id;
    END IF;
    PERFORM set_config('track.reason', 'Sale stock ' || p_sale_id::text, true);
    UPDATE public.inventory SET
      quantity = stock_row.quantity - line.quantity,
      original_device_timestamp = sale_row.created_at
    WHERE id = stock_row.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sale inventory update failed'; END IF;
    applied := applied + 1;
  END LOOP;

  IF line_count = 0 THEN RAISE EXCEPTION 'Sale has no items'; END IF;
  RETURN applied;
END $$;

REVOKE ALL ON FUNCTION public.apply_sale_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_sale_stock(uuid) TO authenticated;

COMMIT;
