-- Warehouse transfers are requested by assigned staff, authorized by the
-- merchant, then counted once by staff at the receiving warehouse.
ALTER TABLE public.warehouse_transfers DROP CONSTRAINT IF EXISTS warehouse_transfers_status_check;
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_status_check
  CHECK (status IN ('pending','authorized','received','rejected','cancelled'));
ALTER TABLE public.warehouse_transfers
  ADD COLUMN IF NOT EXISTS authorized_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS received_quantity integer,
  ADD COLUMN IF NOT EXISTS receiving_note text;

DROP POLICY IF EXISTS org_update ON public.organizations;
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated
  USING (id=public.get_user_org_id() AND public.get_user_role()='business_owner')
  WITH CHECK (id=public.get_user_org_id() AND public.get_user_role()='business_owner');

REVOKE INSERT,UPDATE,DELETE ON public.warehouse_transfers FROM authenticated;
DROP POLICY IF EXISTS transfers_insert_admin ON public.warehouse_transfers;
DROP POLICY IF EXISTS transfers_update_admin ON public.warehouse_transfers;
DROP POLICY IF EXISTS transfers_select_org ON public.warehouse_transfers;
CREATE POLICY transfers_select_org ON public.warehouse_transfers FOR SELECT TO authenticated
USING(organization_id=public.get_user_org_id() AND
  (public.get_user_role()='business_owner' OR EXISTS(SELECT 1 FROM public.warehouse_staff ws
    WHERE ws.organization_id=warehouse_transfers.organization_id AND ws.user_id=(SELECT auth.uid())
      AND ws.warehouse_id IN (warehouse_transfers.from_warehouse_id,warehouse_transfers.to_warehouse_id))));

-- The cashier stock guard permits sale decrements and memo submissions.
-- Add an equally narrow exception for this transaction's receiving RPC.
DO $$ DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('track_private.guard_financial_change()'::regprocedure);
  IF position('track.transfer_write' in definition)=0 THEN
    IF position('IF role_name=''cashier'' THEN' in definition)=0 THEN
      RAISE EXCEPTION 'Stock guard changed; review transfer integration';
    END IF;
    definition := replace(definition,'IF role_name=''cashier'' THEN',
      'IF TG_TABLE_NAME=''inventory'' AND current_setting(''track.transfer_write'',true)=''on'' '
      || 'AND current_setting(''track.transfer_actor'',true)=auth.uid()::text '
      || 'AND EXISTS(SELECT 1 FROM public.warehouse_transfers wt '
      || 'WHERE wt.id=NULLIF(current_setting(''track.transfer_id'',true),'''')::uuid '
      || 'AND wt.organization_id=NEW.organization_id AND wt.to_warehouse_id=NEW.warehouse_id '
      || 'AND wt.product_id=NEW.product_id AND wt.status=''authorized'') THEN RETURN NEW; END IF; '
      || 'IF role_name=''cashier'' THEN');
    EXECUTE definition;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_warehouse_transfer(
  p_from uuid,p_to uuid,p_product uuid,p_quantity integer,p_notes text DEFAULT NULL)
RETURNS public.warehouse_transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; transfer public.warehouse_transfers; owner_id uuid;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
  IF actor.id IS NULL OR actor.role NOT IN ('business_owner','admin','cashier') THEN RAISE EXCEPTION 'Active staff account required'; END IF;
  IF p_from=p_to OR p_quantity IS NULL OR p_quantity<=0 THEN RAISE EXCEPTION 'Choose different warehouses and a positive quantity'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_from AND organization_id=actor.organization_id)
    OR NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_to AND organization_id=actor.organization_id)
    OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product AND organization_id=actor.organization_id AND status='active')
  THEN RAISE EXCEPTION 'Invalid warehouse or product'; END IF;
  IF actor.role<>'business_owner' AND NOT EXISTS(SELECT 1 FROM public.warehouse_staff
    WHERE user_id=actor.id AND warehouse_id=p_from AND organization_id=actor.organization_id)
  THEN RAISE EXCEPTION 'Only assigned source warehouse staff can request a transfer'; END IF;
  INSERT INTO public.warehouse_transfers(organization_id,from_warehouse_id,to_warehouse_id,product_id,quantity,notes,sent_by,status)
  VALUES(actor.organization_id,p_from,p_to,p_product,p_quantity,NULLIF(trim(p_notes),''),actor.id,'pending') RETURNING * INTO transfer;
  SELECT id INTO owner_id FROM public.users WHERE organization_id=actor.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NOT NULL THEN
    INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
    VALUES(actor.organization_id,owner_id,'business_owner','pending_transfer','Transfer approval requested',
      format('A transfer of %s unit(s) needs your authorization.',p_quantity),format('A transfer of %s unit(s) needs your authorization.',p_quantity),
      'warning','warehouse_transfers',transfer.id,'transfer-request:'||transfer.id||':'||owner_id,
      jsonb_build_object('href','/transfers','transfer_id',transfer.id));
  END IF;
  RETURN transfer;
END $$;

CREATE OR REPLACE FUNCTION public.decide_warehouse_transfer(p_id uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS public.warehouse_transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; transfer public.warehouse_transfers; available integer; recipient uuid;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
  IF actor.role<>'business_owner' THEN RAISE EXCEPTION 'Only the merchant can decide transfers'; END IF;
  SELECT * INTO transfer FROM public.warehouse_transfers WHERE id=p_id AND organization_id=actor.organization_id FOR UPDATE;
  IF transfer.id IS NULL OR transfer.status<>'pending' THEN RAISE EXCEPTION 'Transfer is no longer pending'; END IF;
  IF p_approve THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(transfer.from_warehouse_id::text||':'||transfer.product_id::text,0));
    SELECT quantity INTO available FROM public.inventory WHERE product_id=transfer.product_id AND warehouse_id=transfer.from_warehouse_id FOR UPDATE;
    IF COALESCE(available,0)<transfer.quantity THEN RAISE EXCEPTION 'Insufficient stock at source warehouse'; END IF;
    PERFORM set_config('track.reason','Merchant authorized warehouse transfer '||transfer.id::text,true);
    UPDATE public.inventory SET quantity=quantity-transfer.quantity WHERE product_id=transfer.product_id AND warehouse_id=transfer.from_warehouse_id;
    INSERT INTO public.inventory_movements(organization_id,product_id,warehouse_id,movement_type,quantity,reference_id,reference_type,notes,created_by)
    VALUES(actor.organization_id,transfer.product_id,transfer.from_warehouse_id,'transfer',-transfer.quantity,transfer.id,'warehouse_transfer','Merchant authorized dispatch',actor.id);
  END IF;
  UPDATE public.warehouse_transfers SET status=CASE WHEN p_approve THEN 'authorized' ELSE 'rejected' END,
    authorized_by=actor.id,authorized_at=now(),approved_by=actor.full_name,
    notes=CASE WHEN p_approve OR NULLIF(trim(p_reason),'') IS NULL THEN notes ELSE concat_ws(E'\n',notes,'Rejected: '||trim(p_reason)) END
  WHERE id=p_id RETURNING * INTO transfer;
  FOR recipient IN SELECT user_id FROM public.warehouse_staff WHERE organization_id=actor.organization_id
    AND warehouse_id=transfer.to_warehouse_id LOOP
    INSERT INTO public.notifications(organization_id,user_id,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
    VALUES(actor.organization_id,recipient,'pending_transfer',CASE WHEN p_approve THEN 'Transfer ready to receive' ELSE 'Transfer declined' END,
      CASE WHEN p_approve THEN 'Confirm the delivered quantity before adding it to inventory.' ELSE 'The merchant declined this transfer.' END,
      CASE WHEN p_approve THEN 'Confirm the delivered quantity before adding it to inventory.' ELSE 'The merchant declined this transfer.' END,
      CASE WHEN p_approve THEN 'info' ELSE 'warning' END,'warehouse_transfers',transfer.id,
      'transfer-decision:'||transfer.id||':'||recipient,jsonb_build_object('href','/transfers','transfer_id',transfer.id));
  END LOOP;
  RETURN transfer;
END $$;

CREATE OR REPLACE FUNCTION public.receive_warehouse_transfer(p_id uuid,p_quantity integer,p_note text DEFAULT NULL)
RETURNS public.warehouse_transfers LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; transfer public.warehouse_transfers; owner_id uuid;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
  SELECT * INTO transfer FROM public.warehouse_transfers WHERE id=p_id AND organization_id=actor.organization_id FOR UPDATE;
  IF transfer.id IS NULL OR transfer.status<>'authorized' THEN RAISE EXCEPTION 'Transfer is not awaiting receipt'; END IF;
  IF actor.role<>'business_owner' AND NOT EXISTS(SELECT 1 FROM public.warehouse_staff
    WHERE user_id=actor.id AND warehouse_id=transfer.to_warehouse_id AND organization_id=actor.organization_id)
  THEN RAISE EXCEPTION 'Only assigned receiving staff can confirm this shipment'; END IF;
  IF p_quantity IS NULL OR p_quantity<0 OR p_quantity>transfer.quantity THEN RAISE EXCEPTION 'Invalid received quantity'; END IF;
  IF p_quantity<>transfer.quantity AND length(trim(COALESCE(p_note,'')))<3 THEN RAISE EXCEPTION 'Explain the quantity difference'; END IF;
  IF p_quantity>0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(transfer.to_warehouse_id::text||':'||transfer.product_id::text,0));
    PERFORM set_config('track.transfer_write','on',true);
    PERFORM set_config('track.transfer_actor',actor.id::text,true);
    PERFORM set_config('track.transfer_id',transfer.id::text,true);
    PERFORM set_config('track.reason','Warehouse transfer '||transfer.id::text||' receipt',true);
    INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity)
    VALUES(actor.organization_id,transfer.product_id,transfer.to_warehouse_id,p_quantity)
    ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity=public.inventory.quantity+EXCLUDED.quantity;
    INSERT INTO public.inventory_movements(organization_id,product_id,warehouse_id,movement_type,quantity,reference_id,reference_type,notes,created_by)
    VALUES(actor.organization_id,transfer.product_id,transfer.to_warehouse_id,'transfer',p_quantity,transfer.id,'warehouse_transfer',
      COALESCE(NULLIF(trim(p_note),''),'Receiving warehouse confirmed shipment'),actor.id);
  END IF;
  UPDATE public.warehouse_transfers SET status='received',received_by=actor.id,date_received=now(),received_quantity=p_quantity,
    receiving_note=NULLIF(trim(p_note),'') WHERE id=p_id RETURNING * INTO transfer;
  IF p_quantity<>transfer.quantity THEN
    FOR owner_id IN SELECT id FROM public.users WHERE organization_id=actor.organization_id AND role='business_owner' AND status='active' LOOP
      INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
      VALUES(actor.organization_id,owner_id,'business_owner','pending_transfer','Transfer quantity discrepancy',
        format('Expected %s, received %s. %s',transfer.quantity,p_quantity,trim(p_note)),
        format('Expected %s, received %s. %s',transfer.quantity,p_quantity,trim(p_note)),
        'warning','warehouse_transfers',transfer.id,'transfer-discrepancy:'||transfer.id||':'||owner_id,
        jsonb_build_object('href','/transfers','transfer_id',transfer.id,'expected',transfer.quantity,'received',p_quantity));
    END LOOP;
  END IF;
  RETURN transfer;
END $$;

REVOKE ALL ON FUNCTION public.request_warehouse_transfer(uuid,uuid,uuid,integer,text),
  public.decide_warehouse_transfer(uuid,boolean,text),public.receive_warehouse_transfer(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_warehouse_transfer(uuid,uuid,uuid,integer,text),
  public.decide_warehouse_transfer(uuid,boolean,text),public.receive_warehouse_transfer(uuid,integer,text) TO authenticated;
