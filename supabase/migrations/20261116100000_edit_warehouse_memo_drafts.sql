-- Drafts have no stock effect. Lock the row so sending and editing cannot race.
CREATE OR REPLACE FUNCTION public.edit_warehouse_memo_draft(
  p_memo uuid, p_warehouse uuid, p_direction text, p_reference text, p_items jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users; memo public.warehouse_memos;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND role='business_owner' AND status='active';
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Business owner permission required'; END IF;
  SELECT * INTO memo FROM public.warehouse_memos
    WHERE id=p_memo AND organization_id=actor.organization_id FOR UPDATE;
  IF memo.id IS NULL OR memo.status<>'draft' THEN RAISE EXCEPTION 'Only a draft memo can be edited'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id=p_warehouse AND organization_id=actor.organization_id) THEN
    RAISE EXCEPTION 'Warehouse not found';
  END IF;
  IF p_direction NOT IN ('in','out') OR length(trim(p_reference)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'Direction and reference are required';
  END IF;
  PERFORM track_private.assert_memo_items(actor.organization_id,p_items);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) value WHERE (value->>'quantity')::integer=0) THEN
    RAISE EXCEPTION 'Expected quantities must exceed zero';
  END IF;
  UPDATE public.warehouse_memos SET warehouse_id=p_warehouse, direction=p_direction,
    reference=trim(p_reference), expected_items=p_items WHERE id=memo.id;
END $$;
REVOKE ALL ON FUNCTION public.edit_warehouse_memo_draft(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_warehouse_memo_draft(uuid,uuid,text,text,jsonb) TO authenticated;
