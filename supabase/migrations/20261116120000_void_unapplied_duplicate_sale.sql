-- Some offline retries uploaded a second, identical sale without applying stock.
-- Permit an owner to void only that verified duplicate, without restoring stock.
CREATE OR REPLACE FUNCTION public.reverse_unapplied_duplicate_sale(target uuid, reversal_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor public.users;
  sale_row public.sales;
  expected_items jsonb;
  other_sale public.sales;
  other_items jsonb;
  other_ledger jsonb;
  result uuid;
  matching_duplicate boolean := false;
BEGIN
  SELECT * INTO actor FROM public.users
   WHERE id = auth.uid() AND role = 'business_owner' AND status = 'active';
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Business owner permission required'; END IF;
  IF length(trim(coalesce(reversal_reason, ''))) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO sale_row FROM public.sales
   WHERE id = target AND organization_id = actor.organization_id FOR UPDATE;
  IF sale_row.id IS NULL OR sale_row.status <> 'completed' THEN RAISE EXCEPTION 'Completed sale not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.financial_reversals
              WHERE sale_id = target AND kind IN ('void', 'refund', 'return')) THEN
    RAISE EXCEPTION 'Sale already reversed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_movements
              WHERE organization_id = sale_row.organization_id
                AND original_device_timestamp = sale_row.created_at
                AND reference_type = 'inventory_ledger') THEN
    RAISE EXCEPTION 'This sale has stock effects; use the normal reversal';
  END IF;

  SELECT jsonb_agg(jsonb_build_array(product_id, warehouse_id, quantity)
                   ORDER BY product_id, warehouse_id)
    INTO expected_items
    FROM (SELECT product_id, warehouse_id, sum(quantity)::integer AS quantity
            FROM public.sale_items WHERE sale_id = target
           GROUP BY product_id, warehouse_id) grouped;
  IF expected_items IS NULL THEN RAISE EXCEPTION 'Sale has no items'; END IF;

  FOR other_sale IN SELECT * FROM public.sales
    WHERE organization_id = sale_row.organization_id AND id <> target
      AND status = 'completed' AND total = sale_row.total
      AND created_at BETWEEN sale_row.created_at - interval '5 seconds' AND sale_row.created_at
    ORDER BY created_at DESC
  LOOP
    SELECT jsonb_agg(jsonb_build_array(product_id, warehouse_id, quantity)
                     ORDER BY product_id, warehouse_id)
      INTO other_items
      FROM (SELECT product_id, warehouse_id, sum(quantity)::integer AS quantity
              FROM public.sale_items WHERE sale_id = other_sale.id
             GROUP BY product_id, warehouse_id) grouped;
    IF other_items IS DISTINCT FROM expected_items THEN CONTINUE; END IF;

    SELECT jsonb_agg(jsonb_build_array(product_id, warehouse_id, quantity)
                     ORDER BY product_id, warehouse_id)
      INTO other_ledger
      FROM (SELECT product_id, warehouse_id, -sum(quantity)::integer AS quantity
              FROM public.inventory_movements
             WHERE organization_id = sale_row.organization_id
               AND original_device_timestamp = other_sale.created_at
               AND reference_type = 'inventory_ledger' AND quantity < 0
             GROUP BY product_id, warehouse_id) grouped;
    IF other_ledger = expected_items THEN
      matching_duplicate := true;
      EXIT;
    END IF;
  END LOOP;
  IF NOT matching_duplicate THEN
    RAISE EXCEPTION 'Stock has not reconciled. Sync and review stock before reversing this sale';
  END IF;

  INSERT INTO public.financial_reversals(organization_id, sale_id, kind, reason, amount, created_by)
  VALUES(sale_row.organization_id, target, 'void', trim(reversal_reason), -sale_row.total, actor.id)
  RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.reverse_unapplied_duplicate_sale(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_unapplied_duplicate_sale(uuid,text) TO authenticated;
