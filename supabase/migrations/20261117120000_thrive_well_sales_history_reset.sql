-- Preserve financial evidence while hiding reset receipts from merchant views.
-- The maintenance operation below is deliberately limited to the verified
-- Thrive-Well duplicate and must be invoked separately after this migration.
BEGIN;

CREATE TABLE public.historical_sale_reset_tombstones (
  historical_sale_id uuid PRIMARY KEY REFERENCES public.historical_sales(id),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historical_sale_reset_tombstones_org_idx
  ON public.historical_sale_reset_tombstones (organization_id);
ALTER TABLE public.historical_sale_reset_tombstones ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_sale_reset_read ON public.historical_sale_reset_tombstones
  FOR SELECT TO authenticated USING (organization_id = (SELECT public.get_user_org_id()));
REVOKE ALL ON public.historical_sale_reset_tombstones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.historical_sale_reset_tombstones TO authenticated;

CREATE TABLE track_private.sales_history_reset_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  source_sale_id uuid NOT NULL REFERENCES public.sales(id),
  created_by uuid NOT NULL REFERENCES public.users(id),
  current_sale_count integer NOT NULL,
  historical_sale_count integer NOT NULL,
  stock_units_deducted integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON track_private.sales_history_reset_events FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sales_history_reset_event_immutable BEFORE UPDATE OR DELETE
  ON track_private.sales_history_reset_events FOR EACH ROW
  EXECUTE FUNCTION track_private.immutable_record();
CREATE TRIGGER sales_history_reset_event_audit AFTER INSERT
  ON track_private.sales_history_reset_events FOR EACH ROW
  EXECUTE FUNCTION track_private.capture_audit();

-- After the reset, an old offline till must not resurrect an earlier sale.
CREATE FUNCTION track_private.guard_sale_before_history_reset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM track_private.sales_history_reset_events e
             WHERE e.organization_id = NEW.organization_id
               AND (NEW.created_at IS NULL OR NEW.created_at <= e.created_at)) THEN
    RAISE EXCEPTION 'This sale predates the business history reset; review the device queue';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_sale_before_history_reset() FROM PUBLIC;
CREATE TRIGGER guard_sale_before_history_reset BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION track_private.guard_sale_before_history_reset();

-- Historical import retries can carry an old sold_at even when inserted today.
CREATE FUNCTION track_private.guard_historical_sale_before_history_reset()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM track_private.sales_history_reset_events e
             WHERE e.organization_id = NEW.organization_id
               AND (NEW.sold_at IS NULL OR NEW.sold_at <= e.created_at)) THEN
    RAISE EXCEPTION 'This historical sale predates the business history reset; review the import';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_historical_sale_before_history_reset() FROM PUBLIC;
CREATE TRIGGER guard_historical_sale_before_history_reset BEFORE INSERT ON public.historical_sales
  FOR EACH ROW EXECUTE FUNCTION track_private.guard_historical_sale_before_history_reset();

CREATE FUNCTION public.reset_thrive_well_sales_history(p_request_id uuid, p_authorized_by uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  org_id constant uuid := '461a56a3-86f0-4385-bc17-c2d0e3694ffa';
  owner_id constant uuid := 'ae38e198-f146-44c9-8d65-86818986ac4b';
  original_id constant uuid := 'e1b3776a-92ad-4e6a-9d1d-e961a5b4d083';
  duplicate_id constant uuid := '66485543-096e-495c-bcf6-22d6c8091aa8';
  original public.sales;
  duplicate public.sales;
  current_count integer;
  historical_count integer;
  item_count integer;
  item_units integer;
  ledger_count integer;
  ledger_units integer;
  line record;
  existing track_private.sales_history_reset_events;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Reset request ID required'; END IF;
  SELECT * INTO existing FROM track_private.sales_history_reset_events WHERE id = p_request_id;
  IF FOUND THEN
    IF existing.organization_id <> org_id OR existing.source_sale_id <> original_id
       OR existing.created_by <> owner_id OR p_authorized_by IS DISTINCT FROM existing.created_by THEN
      RAISE EXCEPTION 'Reset request ID already used';
    END IF;
    RETURN jsonb_build_object('current_sales', existing.current_sale_count,
      'historical_sales', existing.historical_sale_count,
      'stock_units_deducted', existing.stock_units_deducted, 'already_applied', true);
  END IF;
  IF p_authorized_by IS DISTINCT FROM owner_id OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = owner_id AND organization_id = org_id
      AND role = 'business_owner' AND status = 'active'
  ) THEN RAISE EXCEPTION 'Verified Thrive-Well owner authorization required'; END IF;
  IF EXISTS (SELECT 1 FROM track_private.sales_history_reset_events WHERE organization_id = org_id) THEN
    RAISE EXCEPTION 'Thrive-Well sales history already reset';
  END IF;

  -- Block new sales/imports for the duration of the count and marker snapshot.
  -- Stock writers take inventory before inventory_movements; match that order.
  LOCK TABLE public.sales, public.historical_sales, public.sale_items,
    public.inventory, public.inventory_movements, public.financial_reversals
    IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM track_private.sales_history_reset_events WHERE organization_id = org_id) THEN
    RAISE EXCEPTION 'Thrive-Well sales history already reset';
  END IF;
  SELECT * INTO original FROM public.sales WHERE id = original_id AND organization_id = org_id;
  SELECT * INTO duplicate FROM public.sales WHERE id = duplicate_id AND organization_id = org_id;
  IF original.id IS NULL OR duplicate.id IS NULL OR original.status <> 'completed'
     OR duplicate.status <> 'completed' OR original.total <> duplicate.total
     OR duplicate.created_at <= original.created_at
     OR duplicate.created_at > original.created_at + interval '5 seconds'
     OR original.invoice_number <> 'INV-99886DBB-0FFD-4C4C-BF8F-8E53675B076A' THEN
    RAISE EXCEPTION 'Verified duplicate sale no longer matches';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_reversals
                 WHERE sale_id = original_id AND organization_id = org_id AND kind = 'void') THEN
    RAISE EXCEPTION 'Original sale is not voided';
  END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_movements
             WHERE organization_id = org_id AND reference_type = 'inventory_ledger'
               AND original_device_timestamp = duplicate.created_at) THEN
    RAISE EXCEPTION 'Duplicate sale now has stock effects';
  END IF;
  SELECT count(*), coalesce(sum(quantity), 0) INTO item_count, item_units
    FROM public.sale_items WHERE sale_id = original_id;
  SELECT count(*), coalesce(sum(quantity), 0) INTO ledger_count, ledger_units
    FROM public.inventory_movements
   WHERE organization_id = org_id AND reference_type = 'inventory_ledger'
     AND original_device_timestamp = original.created_at AND quantity < 0;
  IF item_count <> 36 OR item_units <> 40 OR ledger_count <> 36 OR ledger_units <> -40
     OR EXISTS (
       (SELECT product_id, warehouse_id, sum(quantity)::integer AS qty
          FROM public.sale_items WHERE sale_id = original_id GROUP BY 1, 2)
       EXCEPT
       (SELECT product_id, warehouse_id, -sum(quantity)::integer AS qty
          FROM public.inventory_movements
         WHERE organization_id = org_id AND reference_type = 'inventory_ledger'
           AND original_device_timestamp = original.created_at AND quantity < 0
         GROUP BY 1, 2)
     ) OR EXISTS (
       (SELECT product_id, warehouse_id, -sum(quantity)::integer AS qty
          FROM public.inventory_movements
         WHERE organization_id = org_id AND reference_type = 'inventory_ledger'
           AND original_device_timestamp = original.created_at AND quantity < 0
         GROUP BY 1, 2)
       EXCEPT
       (SELECT product_id, warehouse_id, sum(quantity)::integer AS qty
          FROM public.sale_items WHERE sale_id = original_id GROUP BY 1, 2)
     ) THEN RAISE EXCEPTION 'Original sale stock evidence differs'; END IF;
  IF EXISTS (
    (SELECT product_id, warehouse_id, sum(quantity)::integer AS qty
       FROM public.sale_items WHERE sale_id = original_id GROUP BY 1, 2)
    EXCEPT
    (SELECT product_id, warehouse_id, sum(quantity)::integer AS qty
       FROM public.sale_items WHERE sale_id = duplicate_id GROUP BY 1, 2)
  ) OR EXISTS (
    (SELECT product_id, warehouse_id, sum(quantity)::integer AS qty
       FROM public.sale_items WHERE sale_id = duplicate_id GROUP BY 1, 2)
    EXCEPT
    (SELECT product_id, warehouse_id, sum(quantity)::integer AS qty
       FROM public.sale_items WHERE sale_id = original_id GROUP BY 1, 2)
  ) THEN RAISE EXCEPTION 'Duplicate items differ'; END IF;

  SELECT count(*) INTO current_count FROM public.sales WHERE organization_id = org_id;
  SELECT count(*) INTO historical_count FROM public.historical_sales WHERE organization_id = org_id;
  IF current_count <> 46 OR historical_count <> 1050 THEN
    RAISE EXCEPTION 'Sales counts changed; review the reset scope';
  END IF;

  PERFORM set_config('track.reason',
    'Confirmed physical sale stock correction; Thrive-Well history reset ' || p_request_id::text, true);
  FOR line IN SELECT product_id, warehouse_id, sum(quantity)::integer AS qty
                FROM public.sale_items WHERE sale_id = original_id GROUP BY 1, 2
  LOOP
    UPDATE public.inventory SET quantity = quantity - line.qty,
      original_device_timestamp = NULL
     WHERE organization_id = org_id AND product_id = line.product_id
       AND warehouse_id = line.warehouse_id AND quantity >= line.qty;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for verified receipt'; END IF;
  END LOOP;

  INSERT INTO public.sale_reset_tombstones(sale_id, organization_id)
    SELECT id, org_id FROM public.sales WHERE organization_id = org_id
    ON CONFLICT (sale_id) DO NOTHING;
  INSERT INTO public.historical_sale_reset_tombstones(historical_sale_id, organization_id)
    SELECT id, org_id FROM public.historical_sales WHERE organization_id = org_id;
  INSERT INTO track_private.sales_history_reset_events
    (id, organization_id, source_sale_id, created_by, current_sale_count,
     historical_sale_count, stock_units_deducted, reason)
  VALUES (p_request_id, org_id, original_id, owner_id, current_count, historical_count,
    item_units, 'Merchant confirmed duplicate checkout, physical delivery and full history reset');
  -- Install visibility rules only after stock and all markers have committed in
  -- this same transaction. Other merchants retain their existing history.
  EXECUTE 'CREATE POLICY sales_hide_thrive_well_reset ON public.sales AS RESTRICTIVE
    FOR SELECT TO authenticated USING (
      organization_id <> ''461a56a3-86f0-4385-bc17-c2d0e3694ffa''::uuid
      OR NOT EXISTS (SELECT 1 FROM public.sale_reset_tombstones t WHERE t.sale_id = sales.id)
    )';
  EXECUTE 'CREATE POLICY historical_sales_hide_thrive_well_reset ON public.historical_sales AS RESTRICTIVE
    FOR SELECT TO authenticated USING (
      organization_id <> ''461a56a3-86f0-4385-bc17-c2d0e3694ffa''::uuid
      OR NOT EXISTS (SELECT 1 FROM public.historical_sale_reset_tombstones t
                     WHERE t.historical_sale_id = historical_sales.id)
    )';
  RETURN jsonb_build_object('current_sales', current_count,
    'historical_sales', historical_count, 'stock_units_deducted', item_units,
    'already_applied', false);
END $$;
REVOKE ALL ON FUNCTION public.reset_thrive_well_sales_history(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_thrive_well_sales_history(uuid, uuid) TO service_role;

COMMIT;
