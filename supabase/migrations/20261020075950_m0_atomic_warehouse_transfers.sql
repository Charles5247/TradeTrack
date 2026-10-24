BEGIN;
-- Existing pending transfers may already have partial legacy stock effects.
-- Preserve them for explicit reconciliation rather than guessing or replaying.
ALTER TABLE public.warehouse_transfers ADD COLUMN stock_command_version smallint;

CREATE FUNCTION track_private.validate_new_transfer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
 IF actor.id IS NULL OR actor.role NOT IN ('business_owner','admin')
  OR actor.organization_id IS DISTINCT FROM NEW.organization_id OR NEW.sent_by IS DISTINCT FROM actor.id
  OR NEW.status IS DISTINCT FROM 'pending' OR NEW.received_by IS NOT NULL OR NEW.date_received IS NOT NULL
  OR NEW.quantity<=0 OR NEW.from_warehouse_id=NEW.to_warehouse_id
  OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=NEW.product_id AND organization_id=NEW.organization_id AND status='active')
  OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=NEW.from_warehouse_id AND organization_id=NEW.organization_id)
  OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=NEW.to_warehouse_id AND organization_id=NEW.organization_id)
 THEN RAISE EXCEPTION 'Valid pending transfer in the active manager business required'; END IF;
 PERFORM track_private.assert_active_transaction_access(NEW.organization_id);
 NEW.stock_command_version:=1;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_new_transfer BEFORE INSERT ON public.warehouse_transfers
 FOR EACH ROW EXECUTE FUNCTION track_private.validate_new_transfer();
REVOKE ALL ON FUNCTION track_private.validate_new_transfer() FROM PUBLIC,anon,authenticated;

-- Clients cannot bypass the command, change approved identity, or reuse its ID.
REVOKE UPDATE,DELETE ON public.warehouse_transfers FROM authenticated,anon;
CREATE FUNCTION public.complete_warehouse_transfer(transfer_id uuid, target_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; transfer public.warehouse_transfers; source public.inventory; destination public.inventory;
 location uuid;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active' FOR SHARE;
 IF actor.id IS NULL OR actor.role NOT IN ('business_owner','admin') THEN RAISE EXCEPTION 'Active stock manager required'; END IF;
 IF target_status NOT IN ('received','cancelled') OR target_status IS NULL THEN RAISE EXCEPTION 'Invalid transfer outcome'; END IF;
 SELECT * INTO transfer FROM public.warehouse_transfers WHERE id=transfer_id AND organization_id=actor.organization_id FOR UPDATE;
 IF transfer.id IS NULL THEN RAISE EXCEPTION 'Transfer not found in business'; END IF;
 PERFORM track_private.assert_active_transaction_access(actor.organization_id);
 IF transfer.status=target_status THEN RETURN to_jsonb(transfer); END IF;
 IF transfer.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Transfer already finalized'; END IF;
 IF transfer.stock_command_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Legacy transfer requires stock reconciliation before finalization'; END IF;
 IF target_status='received' THEN
  IF transfer.quantity<=0 OR transfer.from_warehouse_id=transfer.to_warehouse_id
   OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=transfer.product_id AND organization_id=actor.organization_id AND status='active')
   OR (SELECT count(*) FROM public.warehouses WHERE id IN(transfer.from_warehouse_id,transfer.to_warehouse_id) AND organization_id=actor.organization_id)<>2
  THEN RAISE EXCEPTION 'Invalid transfer stock position'; END IF;
  -- Compatible with manual adjustments; lock both positions in stable order.
  FOR location IN SELECT w FROM unnest(ARRAY[transfer.from_warehouse_id,transfer.to_warehouse_id]) w ORDER BY w LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(actor.organization_id::text||transfer.product_id::text||location::text,1703));
  END LOOP;
  INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity,min_stock_level)
   VALUES(actor.organization_id,transfer.product_id,transfer.to_warehouse_id,0,5)
   ON CONFLICT(product_id,warehouse_id) DO NOTHING;
  PERFORM id FROM public.inventory WHERE organization_id=actor.organization_id AND product_id=transfer.product_id
   AND warehouse_id IN(transfer.from_warehouse_id,transfer.to_warehouse_id) ORDER BY id FOR UPDATE;
  SELECT * INTO source FROM public.inventory WHERE organization_id=actor.organization_id AND product_id=transfer.product_id AND warehouse_id=transfer.from_warehouse_id;
  SELECT * INTO destination FROM public.inventory WHERE organization_id=actor.organization_id AND product_id=transfer.product_id AND warehouse_id=transfer.to_warehouse_id;
  IF source.id IS NULL OR source.quantity<transfer.quantity THEN RAISE EXCEPTION 'Insufficient source stock'; END IF;
  IF destination.quantity::bigint+transfer.quantity>2147483647 THEN RAISE EXCEPTION 'Destination stock overflow'; END IF;
  PERFORM set_config('track.reason','Warehouse transfer '||transfer.id::text,true);
  UPDATE public.inventory SET quantity=quantity-transfer.quantity,original_device_timestamp=NULL WHERE id=source.id;
  UPDATE public.inventory SET quantity=quantity+transfer.quantity,original_device_timestamp=NULL WHERE id=destination.id;
 END IF;
 UPDATE public.warehouse_transfers SET status=target_status,
  received_by=CASE WHEN target_status='received' THEN actor.id ELSE NULL END,
  date_received=CASE WHEN target_status='received' THEN now() ELSE NULL END
 WHERE id=transfer.id RETURNING * INTO transfer;
 RETURN to_jsonb(transfer);
END $$;
REVOKE ALL ON FUNCTION public.complete_warehouse_transfer(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_warehouse_transfer(uuid,text) TO authenticated;
COMMIT;
