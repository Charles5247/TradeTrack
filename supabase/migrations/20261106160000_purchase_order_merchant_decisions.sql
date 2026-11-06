-- Admins may draft orders, but only the merchant may send or cancel a
-- prepared order. Edits to draft lines are made atomically through the RPC.
CREATE OR REPLACE FUNCTION track_private.guard_purchase_order_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('sent','cancelled')
    AND public.get_user_role()<>'business_owner' THEN
    RAISE EXCEPTION 'Only the merchant can send or decline a purchase order';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS merchant_purchase_order_decision ON public.purchase_orders;
CREATE TRIGGER merchant_purchase_order_decision BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION track_private.guard_purchase_order_decision();

CREATE OR REPLACE FUNCTION public.merchant_edit_purchase_order(p_id uuid,p_items jsonb,p_notes text,p_expected date)
RETURNS public.purchase_orders LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; purchase public.purchase_orders; item jsonb; line public.purchase_order_items;
  quantity integer; new_unit_cost numeric; count_items integer;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
  IF actor.role<>'business_owner' THEN RAISE EXCEPTION 'Only the merchant can edit this order'; END IF;
  SELECT * INTO purchase FROM public.purchase_orders WHERE id=p_id AND organization_id=actor.organization_id FOR UPDATE;
  IF purchase.id IS NULL OR purchase.status<>'draft' THEN RAISE EXCEPTION 'Only an existing draft can be edited'; END IF;
  IF jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'Order items must be an array'; END IF;
  SELECT count(*) INTO count_items FROM public.purchase_order_items WHERE purchase_order_id=p_id;
  IF jsonb_array_length(p_items)<>count_items OR count_items=0 THEN RAISE EXCEPTION 'Include every existing order line'; END IF;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_items))<>count_items THEN RAISE EXCEPTION 'Duplicate order line'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO line FROM public.purchase_order_items WHERE id=(item->>'id')::uuid AND purchase_order_id=p_id FOR UPDATE;
    IF line.id IS NULL THEN RAISE EXCEPTION 'Invalid order line'; END IF;
    quantity := (item->>'quantity')::integer;
    new_unit_cost := (item->>'unit_cost')::numeric;
    IF quantity<=0 OR new_unit_cost<0 THEN RAISE EXCEPTION 'Quantity and unit cost must be valid'; END IF;
    UPDATE public.purchase_order_items SET quantity_ordered=quantity,unit_cost=new_unit_cost WHERE id=line.id;
  END LOOP;
  UPDATE public.purchase_orders SET notes=NULLIF(trim(p_notes),''),expected_date=p_expected,
    total_value=(SELECT sum(quantity_ordered*unit_cost) FROM public.purchase_order_items WHERE purchase_order_id=p_id)
    WHERE id=p_id RETURNING * INTO purchase;
  RETURN purchase;
END $$;
REVOKE ALL ON FUNCTION public.merchant_edit_purchase_order(uuid,jsonb,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.merchant_edit_purchase_order(uuid,jsonb,text,date) TO authenticated;
