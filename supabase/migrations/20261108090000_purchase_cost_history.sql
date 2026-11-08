-- Trackasuwa moving average cost on full purchase order receipt.
-- Existing product.cost_price is the opening average for stock already on hand.
-- Historical sale_items.cost_price is never rewritten.

CREATE TABLE IF NOT EXISTS public.product_cost_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  source_type text NOT NULL CHECK (source_type IN ('purchase_order', 'stock_receipt')),
  source_id uuid NOT NULL UNIQUE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id),
  purchase_order_item_id uuid UNIQUE REFERENCES public.purchase_order_items(id),
  previous_stock integer NOT NULL CHECK (previous_stock >= 0),
  received_quantity integer NOT NULL CHECK (received_quantity > 0),
  unit_cost numeric(12,2) NOT NULL CHECK (unit_cost >= 0),
  previous_average_cost numeric(12,2) NOT NULL CHECK (previous_average_cost >= 0),
  new_average_cost numeric(12,2) NOT NULL CHECK (new_average_cost >= 0),
  recorded_by uuid NOT NULL REFERENCES public.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_cost_history_product_created
  ON public.product_cost_history (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_cost_history_org
  ON public.product_cost_history (organization_id);

ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_cost_history_read ON public.product_cost_history FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.get_user_org_id()) AND public.is_admin_or_above());
REVOKE ALL ON public.product_cost_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_cost_history TO authenticated;

-- This helper is called only by the constrained receipt trigger below.
CREATE OR REPLACE FUNCTION track_private.apply_purchase_cost_receipt(
  p_org uuid, p_product uuid, p_warehouse uuid, p_order uuid, p_source uuid,
  p_quantity integer, p_unit_cost numeric, p_actor uuid, p_already_added boolean,
  p_notes text
) RETURNS numeric LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  product_row public.products;
  stock_row record;
  old_quantity integer := 0;
  new_cost numeric(12,2);
BEGIN
  IF p_quantity <= 0 OR p_unit_cost < 0 THEN RAISE EXCEPTION 'Invalid receipt quantity or cost'; END IF;
  SELECT * INTO product_row FROM public.products
    WHERE id = p_product AND organization_id = p_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase product does not belong to this business'; END IF;

  -- Lock current rows before calculating the average, including other locations.
  FOR stock_row IN SELECT quantity FROM public.inventory
    WHERE organization_id = p_org AND product_id = p_product ORDER BY id FOR UPDATE
  LOOP
    old_quantity := old_quantity + stock_row.quantity;
  END LOOP;
  IF p_already_added THEN
    old_quantity := old_quantity - p_quantity;
    IF old_quantity < 0 THEN RAISE EXCEPTION 'Received stock is less than the order quantity'; END IF;
  ELSE
    INSERT INTO public.inventory (organization_id, product_id, warehouse_id, quantity, min_stock_level)
      VALUES (p_org, p_product, p_warehouse, p_quantity, 5)
      ON CONFLICT (product_id, warehouse_id) DO UPDATE
      SET quantity = public.inventory.quantity + EXCLUDED.quantity;
    INSERT INTO public.inventory_movements
      (organization_id, product_id, warehouse_id, movement_type, quantity,
       reference_id, reference_type, notes, created_by)
      VALUES (p_org, p_product, p_warehouse, 'in', p_quantity,
        COALESCE(p_order, p_source), CASE WHEN p_order IS NULL THEN 'stock_receipt' ELSE 'purchase_order' END,
        COALESCE(NULLIF(trim(p_notes), ''), 'Received from purchase order'), p_actor);
  END IF;

  new_cost := round(
    (old_quantity * product_row.cost_price + p_quantity * p_unit_cost)
      / (old_quantity + p_quantity), 2);
  UPDATE public.products SET cost_price = new_cost WHERE id = p_product;
  INSERT INTO public.product_cost_history
    (organization_id, product_id, warehouse_id, source_type, source_id,
     purchase_order_id, purchase_order_item_id, previous_stock, received_quantity,
     unit_cost, previous_average_cost, new_average_cost, recorded_by, notes)
    VALUES (p_org, p_product, p_warehouse,
      CASE WHEN p_order IS NULL THEN 'stock_receipt' ELSE 'purchase_order' END,
      p_source, p_order, CASE WHEN p_order IS NULL THEN NULL ELSE p_source END,
      old_quantity, p_quantity, p_unit_cost, product_row.cost_price, new_cost,
      p_actor, p_notes);
  RETURN new_cost;
END $$;
REVOKE ALL ON FUNCTION track_private.apply_purchase_cost_receipt(uuid,uuid,uuid,uuid,uuid,integer,numeric,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION track_private.receive_purchase_order_costed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor public.users;
  target_warehouse uuid;
  line public.purchase_order_items;
  line_count integer := 0;
BEGIN
  IF OLD.status = NEW.status OR NEW.status <> 'received' THEN RETURN NEW; END IF;
  SELECT * INTO actor FROM public.users WHERE id = auth.uid() AND status = 'active';
  IF actor.id IS NULL OR actor.organization_id <> NEW.organization_id
     OR actor.role NOT IN ('business_owner', 'admin') THEN
    RAISE EXCEPTION 'Only this business owner or manager can receive the order';
  END IF;
  IF OLD.status <> 'sent' THEN RAISE EXCEPTION 'Only a sent order can be received'; END IF;
  SELECT id INTO target_warehouse FROM public.warehouses
    WHERE organization_id = NEW.organization_id
    ORDER BY is_main DESC, created_at, id LIMIT 1;
  IF target_warehouse IS NULL THEN RAISE EXCEPTION 'Create a stock location before receiving an order'; END IF;

  FOR line IN SELECT * FROM public.purchase_order_items
    WHERE purchase_order_id = NEW.id ORDER BY product_id, id FOR UPDATE
  LOOP
    line_count := line_count + 1;
    IF line.quantity_received NOT IN (0, line.quantity_ordered) THEN
      RAISE EXCEPTION 'Partially received orders need manual review';
    END IF;
    PERFORM track_private.apply_purchase_cost_receipt(
      NEW.organization_id, line.product_id, target_warehouse, NEW.id, line.id,
      line.quantity_ordered, line.unit_cost, actor.id,
      line.quantity_received = line.quantity_ordered, 'Received from purchase order');
    IF line.quantity_received = 0 THEN
      UPDATE public.purchase_order_items SET quantity_received = quantity_ordered WHERE id = line.id;
    END IF;
  END LOOP;
  IF line_count = 0 THEN RAISE EXCEPTION 'Cannot receive an empty purchase order'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.receive_purchase_order_costed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS purchase_order_costed_receipt ON public.purchase_orders;
CREATE TRIGGER purchase_order_costed_receipt AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION track_private.receive_purchase_order_costed();

-- A direct stock purchase uses the same calculation and audit record. The
-- client chooses a stable receipt ID so retries cannot add stock twice.
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
