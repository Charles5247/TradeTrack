-- A memo instructs a location; staff observations and stock effects remain auditable.
CREATE TABLE IF NOT EXISTS public.warehouse_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  warehouse_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  reference text NOT NULL CHECK (length(trim(reference)) BETWEEN 3 AND 200),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','submitted','approved')),
  expected_items jsonb NOT NULL,
  actual_items jsonb,
  approved_items jsonb,
  created_by uuid NOT NULL REFERENCES public.users(id),
  submitted_by uuid REFERENCES public.users(id),
  reviewed_by uuid REFERENCES public.users(id),
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  FOREIGN KEY (organization_id, warehouse_id) REFERENCES public.warehouses(organization_id,id)
);
CREATE INDEX IF NOT EXISTS warehouse_memos_org_location_date ON public.warehouse_memos(organization_id,warehouse_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.warehouse_memo_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  memo_id uuid NOT NULL REFERENCES public.warehouse_memos(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  stage text NOT NULL CHECK (stage IN ('submission','correction')),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warehouse_memo_effects_history ON public.warehouse_memo_effects(organization_id,product_id,created_at DESC);
DROP TRIGGER IF EXISTS warehouse_memo_effects_immutable ON public.warehouse_memo_effects;
CREATE TRIGGER warehouse_memo_effects_immutable BEFORE UPDATE OR DELETE ON public.warehouse_memo_effects
FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();

ALTER TABLE public.warehouse_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_memo_effects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS warehouse_memos_read ON public.warehouse_memos;
CREATE POLICY warehouse_memos_read ON public.warehouse_memos FOR SELECT TO authenticated
USING (organization_id=(SELECT public.get_user_org_id()) AND (
  (SELECT public.is_business_owner()) OR (status<>'draft' AND EXISTS (
    SELECT 1 FROM public.warehouse_staff ws WHERE ws.organization_id=warehouse_memos.organization_id
      AND ws.warehouse_id=warehouse_memos.warehouse_id AND ws.user_id=(SELECT auth.uid())
  ))
));
DROP POLICY IF EXISTS warehouse_memo_effects_read ON public.warehouse_memo_effects;
CREATE POLICY warehouse_memo_effects_read ON public.warehouse_memo_effects FOR SELECT TO authenticated
USING (organization_id=(SELECT public.get_user_org_id()) AND (
  (SELECT public.is_business_owner()) OR EXISTS (
    SELECT 1 FROM public.warehouse_staff ws WHERE ws.organization_id=warehouse_memo_effects.organization_id
      AND ws.warehouse_id=warehouse_memo_effects.warehouse_id AND ws.user_id=(SELECT auth.uid())
  )
));
REVOKE ALL ON public.warehouse_memos, public.warehouse_memo_effects FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.warehouse_memos, public.warehouse_memo_effects TO authenticated;

-- The existing cashier guard accepts sale decrements only. Permit stock writes
-- exclusively inside the authenticated memo RPC transaction, preserving its
-- other sale and discount checks as deployed.
DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('track_private.guard_financial_change()'::regprocedure);
  IF position('track.memo_write' in definition)=0 THEN
    IF position('IF role_name=''cashier'' THEN' in definition)=0 THEN
      RAISE EXCEPTION 'Cashier stock guard changed; review memo integration before installing';
    END IF;
    definition := replace(definition, 'IF role_name=''cashier'' THEN',
      'IF TG_TABLE_NAME=''inventory'' AND current_setting(''track.memo_write'',true)=''on'' '
      || 'AND current_setting(''track.memo_actor'',true)=auth.uid()::text '
      || 'AND EXISTS (SELECT 1 FROM public.warehouse_memos wm WHERE wm.id=NULLIF(current_setting(''track.memo_id'',true),'''')::uuid '
      || 'AND wm.organization_id=NEW.organization_id AND wm.warehouse_id=NEW.warehouse_id '
      || 'AND wm.status IN (''sent'',''submitted'',''approved'')) THEN RETURN NEW; END IF; '
      || 'IF role_name=''cashier'' THEN');
    EXECUTE definition;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION track_private.assert_memo_items(p_org uuid, p_items jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb; count_items integer; count_distinct integer;
BEGIN
  IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Memo needs 1 to 100 products';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item->'product_id')<>'string' OR jsonb_typeof(item->'quantity')<>'number'
      OR (item->>'quantity') !~ '^[0-9]+$' OR (item->>'quantity')::numeric>2147483647
      OR (item->>'quantity')::integer<0 THEN RAISE EXCEPTION 'Invalid memo product or quantity'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=(item->>'product_id')::uuid AND p.organization_id=p_org AND p.status='active') THEN
      RAISE EXCEPTION 'Product is not active in this business';
    END IF;
  END LOOP;
  SELECT count(*),count(DISTINCT value->>'product_id') INTO count_items,count_distinct FROM jsonb_array_elements(p_items);
  IF count_items<>count_distinct THEN RAISE EXCEPTION 'Each product may appear only once per memo'; END IF;
END $$;
REVOKE ALL ON FUNCTION track_private.assert_memo_items(uuid,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_warehouse_memo(p_warehouse uuid,p_direction text,p_reference text,p_items jsonb,p_send boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; result uuid; staff record;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND role='business_owner' AND status='active';
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Business owner permission required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=p_warehouse AND organization_id=actor.organization_id) THEN RAISE EXCEPTION 'Warehouse not found'; END IF;
  IF p_direction NOT IN ('in','out') OR length(trim(p_reference)) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Direction and reference are required'; END IF;
  PERFORM track_private.assert_memo_items(actor.organization_id,p_items);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) value WHERE (value->>'quantity')::integer=0) THEN RAISE EXCEPTION 'Expected quantities must exceed zero'; END IF;
  INSERT INTO public.warehouse_memos(organization_id,warehouse_id,direction,reference,status,expected_items,created_by,sent_at)
  VALUES(actor.organization_id,p_warehouse,p_direction,trim(p_reference),CASE WHEN p_send THEN 'sent' ELSE 'draft' END,p_items,actor.id,CASE WHEN p_send THEN now() END)
  RETURNING id INTO result;
  IF p_send THEN
    FOR staff IN SELECT user_id FROM public.warehouse_staff WHERE organization_id=actor.organization_id AND warehouse_id=p_warehouse LOOP
      INSERT INTO public.notifications(organization_id,user_id,type,title,message,body,data)
      VALUES(actor.organization_id,staff.user_id,'warehouse_memo','Warehouse memo received',trim(p_reference),trim(p_reference),jsonb_build_object('href','/warehouse-memos','memo_id',result));
    END LOOP;
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_warehouse_memo(uuid,text,text,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_warehouse_memo(uuid,text,text,jsonb,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_warehouse_memo(p_memo uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; memo public.warehouse_memos; staff record;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND role='business_owner' AND status='active';
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Business owner permission required'; END IF;
  SELECT * INTO memo FROM public.warehouse_memos WHERE id=p_memo AND organization_id=actor.organization_id FOR UPDATE;
  IF memo.id IS NULL OR memo.status<>'draft' THEN RAISE EXCEPTION 'Only a draft memo can be sent'; END IF;
  UPDATE public.warehouse_memos SET status='sent',sent_at=now() WHERE id=p_memo;
  FOR staff IN SELECT user_id FROM public.warehouse_staff WHERE organization_id=actor.organization_id AND warehouse_id=memo.warehouse_id LOOP
    INSERT INTO public.notifications(organization_id,user_id,type,title,message,body,data)
    VALUES(actor.organization_id,staff.user_id,'warehouse_memo','Warehouse memo received',memo.reference,memo.reference,jsonb_build_object('href','/warehouse-memos','memo_id',memo.id));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.send_warehouse_memo(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.send_warehouse_memo(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_warehouse_memo(p_memo uuid,p_items jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; memo public.warehouse_memos; item jsonb; delta integer; previous integer; owner_id uuid;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active' AND role IN ('business_owner','admin','cashier');
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Active staff account required'; END IF;
  SELECT * INTO memo FROM public.warehouse_memos WHERE id=p_memo AND organization_id=actor.organization_id FOR UPDATE;
  IF memo.id IS NULL OR memo.status<>'sent' THEN RAISE EXCEPTION 'Memo already submitted or not sent'; END IF;
  IF actor.role<>'business_owner' AND NOT EXISTS (SELECT 1 FROM public.warehouse_staff
    WHERE organization_id=actor.organization_id AND warehouse_id=memo.warehouse_id AND user_id=actor.id) THEN
    RAISE EXCEPTION 'You are not assigned to this warehouse';
  END IF;
  PERFORM track_private.assert_memo_items(actor.organization_id,p_items);
  IF (SELECT array_agg(value->>'product_id' ORDER BY value->>'product_id') FROM jsonb_array_elements(p_items)) IS DISTINCT FROM
     (SELECT array_agg(value->>'product_id' ORDER BY value->>'product_id') FROM jsonb_array_elements(memo.expected_items)) THEN
    RAISE EXCEPTION 'Submit a count for every product in the memo';
  END IF;
  PERFORM set_config('track.memo_write','on',true);
  PERFORM set_config('track.memo_actor',actor.id::text,true);
  PERFORM set_config('track.memo_id',memo.id::text,true);
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    delta := (CASE WHEN memo.direction='in' THEN 1 ELSE -1 END)*(item->>'quantity')::integer;
    IF delta=0 THEN CONTINUE; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(memo.warehouse_id::text||':'||(item->>'product_id'),0));
    PERFORM set_config('track.reason','Warehouse memo '||memo.id::text||' staff submission',true);
    IF delta>0 THEN
      INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity)
      VALUES(actor.organization_id,(item->>'product_id')::uuid,memo.warehouse_id,delta)
      ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity=public.inventory.quantity+EXCLUDED.quantity;
    ELSE
      UPDATE public.inventory SET quantity=quantity+delta WHERE organization_id=actor.organization_id
        AND product_id=(item->>'product_id')::uuid AND warehouse_id=memo.warehouse_id AND quantity>=-delta;
      IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for stock-out'; END IF;
    END IF;
    INSERT INTO public.warehouse_memo_effects(organization_id,memo_id,warehouse_id,product_id,stage,quantity_delta,actor_id,reason)
    VALUES(actor.organization_id,memo.id,memo.warehouse_id,(item->>'product_id')::uuid,'submission',delta,actor.id,'Staff recorded shipment');
  END LOOP;
  UPDATE public.warehouse_memos SET status='submitted',actual_items=p_items,submitted_by=actor.id,submitted_at=now() WHERE id=memo.id;
  FOR owner_id IN SELECT id FROM public.users WHERE organization_id=actor.organization_id AND role='business_owner' AND status='active' LOOP
    INSERT INTO public.notifications(organization_id,user_id,type,title,message,body,data)
    VALUES(actor.organization_id,owner_id,'warehouse_memo','Warehouse memo needs review',memo.reference,memo.reference,jsonb_build_object('href','/warehouse-memos','memo_id',memo.id));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.submit_warehouse_memo(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_warehouse_memo(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_warehouse_memo(p_memo uuid,p_items jsonb,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; memo public.warehouse_memos; item jsonb; prior integer; delta integer;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND role='business_owner' AND status='active';
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Business owner permission required'; END IF;
  SELECT * INTO memo FROM public.warehouse_memos WHERE id=p_memo AND organization_id=actor.organization_id FOR UPDATE;
  IF memo.id IS NULL OR memo.status NOT IN ('submitted','approved') THEN RAISE EXCEPTION 'Memo has not been submitted'; END IF;
  PERFORM track_private.assert_memo_items(actor.organization_id,p_items);
  IF (SELECT array_agg(value->>'product_id' ORDER BY value->>'product_id') FROM jsonb_array_elements(p_items)) IS DISTINCT FROM
     (SELECT array_agg(value->>'product_id' ORDER BY value->>'product_id') FROM jsonb_array_elements(memo.expected_items)) THEN
    RAISE EXCEPTION 'Review every product in the memo';
  END IF;
  IF p_items IS DISTINCT FROM COALESCE(memo.approved_items,memo.actual_items) AND length(trim(coalesce(p_reason,'')))<3 THEN
    RAISE EXCEPTION 'Explain any correction';
  END IF;
  PERFORM set_config('track.memo_write','on',true);
  PERFORM set_config('track.memo_actor',actor.id::text,true);
  PERFORM set_config('track.memo_id',memo.id::text,true);
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT (value->>'quantity')::integer INTO prior FROM jsonb_array_elements(COALESCE(memo.approved_items,memo.actual_items)) value
      WHERE value->>'product_id'=item->>'product_id';
    delta := (CASE WHEN memo.direction='in' THEN 1 ELSE -1 END)*((item->>'quantity')::integer-prior);
    IF delta=0 THEN CONTINUE; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(memo.warehouse_id::text||':'||(item->>'product_id'),0));
    PERFORM set_config('track.reason','Warehouse memo '||memo.id::text||' owner correction: '||trim(p_reason),true);
    IF delta>0 THEN
      INSERT INTO public.inventory(organization_id,product_id,warehouse_id,quantity)
      VALUES(actor.organization_id,(item->>'product_id')::uuid,memo.warehouse_id,delta)
      ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity=public.inventory.quantity+EXCLUDED.quantity;
    ELSE
      UPDATE public.inventory SET quantity=quantity+delta WHERE organization_id=actor.organization_id
        AND product_id=(item->>'product_id')::uuid AND warehouse_id=memo.warehouse_id AND quantity>=-delta;
      IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock for correction; review later sales first'; END IF;
    END IF;
    INSERT INTO public.warehouse_memo_effects(organization_id,memo_id,warehouse_id,product_id,stage,quantity_delta,actor_id,reason)
    VALUES(actor.organization_id,memo.id,memo.warehouse_id,(item->>'product_id')::uuid,'correction',delta,actor.id,trim(p_reason));
  END LOOP;
  UPDATE public.warehouse_memos SET status='approved',approved_items=p_items,reviewed_by=actor.id,
    reviewed_at=now(),review_reason=NULLIF(trim(p_reason),'') WHERE id=memo.id;
  IF memo.submitted_by IS NOT NULL AND memo.submitted_by<>actor.id THEN
    INSERT INTO public.notifications(organization_id,user_id,type,title,message,body,data)
    VALUES(actor.organization_id,memo.submitted_by,'warehouse_memo','Warehouse memo reviewed',memo.reference,memo.reference,jsonb_build_object('href','/warehouse-memos','memo_id',memo.id));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.review_warehouse_memo(uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_warehouse_memo(uuid,jsonb,text) TO authenticated;
