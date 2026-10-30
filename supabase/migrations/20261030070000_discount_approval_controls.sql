BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS can_give_discounts boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS max_discount_percent numeric(5,2) CHECK (max_discount_percent IS NULL OR (max_discount_percent>=0 AND max_discount_percent<=100));
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS max_discount_percent numeric(5,2) NOT NULL DEFAULT 100 CHECK (max_discount_percent>=0 AND max_discount_percent<=100);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS discount_approval_minutes integer NOT NULL DEFAULT 15 CHECK (discount_approval_minutes BETWEEN 1 AND 1440);

CREATE TABLE IF NOT EXISTS public.discount_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.users(id),
  cart_snapshot jsonb NOT NULL,
  cart_hash text NOT NULL,
  cart_subtotal numeric(12,2) NOT NULL CHECK (cart_subtotal>0),
  discount_amount numeric(12,2) NOT NULL CHECK (discount_amount>0),
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent>0 AND discount_percent<=100),
  reason text NOT NULL CHECK (length(trim(reason))>=3),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  decider_id uuid REFERENCES public.users(id),
  decided_at timestamptz,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  sale_id uuid REFERENCES public.sales(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS discount_requests_owner_queue ON public.discount_requests(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS discount_requests_requester_queue ON public.discount_requests(requester_id,status,created_at DESC);
ALTER TABLE public.discount_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='discount_requests' AND policyname='discount_requests_visible') THEN
    CREATE POLICY discount_requests_visible ON public.discount_requests FOR SELECT USING (organization_id=public.get_user_org_id() AND (requester_id=auth.uid() OR public.get_user_role()='business_owner'));
  END IF;
END $$;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_authorized_by uuid REFERENCES public.users(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_request_id uuid REFERENCES public.discount_requests(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_reason text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_cart_hash text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_permission_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.request_discount_approval(p_cart_snapshot jsonb,p_cart_hash text,p_cart_subtotal numeric,p_discount_amount numeric,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor public.users; org public.organizations; request_id uuid; discount_percent numeric;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
  SELECT * INTO org FROM public.organizations WHERE id=actor.organization_id;
  IF actor.id IS NULL OR actor.role='business_owner' THEN RAISE EXCEPTION 'A staff account must request approval'; END IF;
  IF jsonb_typeof(p_cart_snapshot)<>'object' OR length(p_cart_hash)<16 OR p_cart_subtotal<=0 OR p_discount_amount<=0 OR length(trim(p_reason))<3 THEN RAISE EXCEPTION 'Complete cart, discount and reason are required'; END IF;
  discount_percent:=round(p_discount_amount/p_cart_subtotal*100,2);
  IF discount_percent>org.max_discount_percent THEN RAISE EXCEPTION 'Discount exceeds the business maximum'; END IF;
  INSERT INTO public.discount_requests(organization_id,requester_id,cart_snapshot,cart_hash,cart_subtotal,discount_amount,discount_percent,reason,expires_at)
  VALUES(actor.organization_id,actor.id,p_cart_snapshot,p_cart_hash,p_cart_subtotal,p_discount_amount,discount_percent,p_reason,now()+make_interval(mins=>org.discount_approval_minutes)) RETURNING id INTO request_id;
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,staff_user_id,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  SELECT actor.organization_id,u.id,'business_owner',actor.id,'discount_requested','Discount approval requested',format('%s requested a %s%% discount. Reason: %s',actor.full_name,discount_percent,p_reason),format('%s requested a %s%% discount. Reason: %s',actor.full_name,discount_percent,p_reason),'warning','discount_request',request_id,'discount-request:'||request_id||':'||u.id,jsonb_build_object('request_id',request_id,'requester_id',actor.id,'discount_percent',discount_percent)
  FROM public.users u WHERE u.organization_id=actor.organization_id AND u.role='business_owner' AND u.status='active';
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values,reason) VALUES(actor.organization_id,actor.id,'REQUEST_DISCOUNT','discount_request',request_id,jsonb_build_object('discount_amount',p_discount_amount,'discount_percent',discount_percent,'cart_hash',p_cart_hash),p_reason);
  RETURN request_id;
END $$;

CREATE OR REPLACE FUNCTION public.decide_discount_request(p_request_id uuid,p_approve boolean,p_reason text DEFAULT NULL)
RETURNS public.discount_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor public.users; request_row public.discount_requests;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid() AND status='active';
  IF actor.role<>'business_owner' THEN RAISE EXCEPTION 'Only the business owner can decide discount requests'; END IF;
  SELECT * INTO request_row FROM public.discount_requests WHERE id=p_request_id AND organization_id=actor.organization_id FOR UPDATE;
  IF request_row.id IS NULL OR request_row.status<>'pending' THEN RAISE EXCEPTION 'Request is no longer pending'; END IF;
  IF request_row.expires_at<=now() THEN UPDATE public.discount_requests SET status='expired' WHERE id=p_request_id RETURNING * INTO request_row; RETURN request_row; END IF;
  UPDATE public.discount_requests SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,decider_id=actor.id,decided_at=now()
   WHERE id=p_request_id RETURNING * INTO request_row;
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(actor.organization_id,request_row.requester_id,NULL,CASE WHEN p_approve THEN 'discount_approved' ELSE 'discount_rejected' END,CASE WHEN p_approve THEN 'Discount approved' ELSE 'Discount rejected' END,COALESCE(p_reason,CASE WHEN p_approve THEN 'The owner approved this discount.' ELSE 'The owner rejected this discount.' END),COALESCE(p_reason,CASE WHEN p_approve THEN 'The owner approved this discount.' ELSE 'The owner rejected this discount.' END),CASE WHEN p_approve THEN 'success' ELSE 'warning' END,'discount_request',request_row.id,'discount-decision:'||request_row.id,jsonb_build_object('request_id',request_row.id,'status',request_row.status));
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values,reason) VALUES(actor.organization_id,actor.id,CASE WHEN p_approve THEN 'APPROVE_DISCOUNT' ELSE 'REJECT_DISCOUNT' END,'discount_request',request_row.id,jsonb_build_object('status',request_row.status),p_reason);
  RETURN request_row;
END $$;

REVOKE ALL ON FUNCTION public.request_discount_approval(jsonb,text,numeric,numeric,text),public.decide_discount_request(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_discount_approval(jsonb,text,numeric,numeric,text),public.decide_discount_request(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION track_private.guard_financial_change() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE role_name text; allowed numeric; listed numeric; sold integer; actor public.users; org public.organizations; approval public.discount_requests; effective_percent numeric;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id=auth.uid(); role_name:=actor.role;
  IF TG_TABLE_NAME='sales' AND TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['updated_at','official_invoice_number']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','official_invoice_number']) THEN RAISE EXCEPTION 'Sales are immutable; use a reversal or payment correction'; END IF;
  IF TG_TABLE_NAME='sales' THEN
   IF role_name<>'business_owner' THEN
    IF NEW.cashier_id<>auth.uid() THEN RAISE EXCEPTION 'Invalid cashier'; END IF;
    IF NEW.discount<>0 THEN
      SELECT * INTO org FROM public.organizations WHERE id=NEW.organization_id;
      effective_percent:=round(NEW.discount/NULLIF(NEW.subtotal,0)*100,2);
      IF effective_percent>org.max_discount_percent THEN RAISE EXCEPTION 'Discount exceeds the business maximum'; END IF;
      IF NEW.discount_request_id IS NOT NULL THEN
        SELECT * INTO approval FROM public.discount_requests WHERE id=NEW.discount_request_id FOR UPDATE;
        IF approval.status<>'approved' OR approval.used_at IS NOT NULL OR approval.expires_at<=now() OR approval.requester_id<>auth.uid() OR approval.cart_hash IS DISTINCT FROM NEW.discount_cart_hash OR approval.cart_subtotal IS DISTINCT FROM NEW.subtotal OR approval.discount_amount IS DISTINCT FROM NEW.discount THEN RAISE EXCEPTION 'Discount approval is invalid, expired, used, or belongs to a changed cart'; END IF;
        NEW.discount_authorized_by:=approval.decider_id;
        UPDATE public.discount_requests SET used_at=now(),sale_id=NEW.id,status='approved' WHERE id=approval.id;
      ELSIF actor.can_give_discounts AND effective_percent<=COALESCE(actor.max_discount_percent,org.max_discount_percent) THEN
        NEW.discount_authorized_by:=actor.id;
        NEW.discount_permission_snapshot:=jsonb_build_object('user_id',actor.id,'max_discount_percent',actor.max_discount_percent,'recorded_at',now());
      ELSE RAISE EXCEPTION 'Owner approval is required for this discount'; END IF;
      IF length(trim(COALESCE(NEW.discount_reason,'')))<3 THEN RAISE EXCEPTION 'A discount reason is required'; END IF;
    END IF;
   ELSIF role_name='business_owner' AND NEW.discount<>0 THEN
    SELECT * INTO org FROM public.organizations WHERE id=NEW.organization_id;
    effective_percent:=round(NEW.discount/NULLIF(NEW.subtotal,0)*100,2);
    IF effective_percent>org.max_discount_percent THEN RAISE EXCEPTION 'Discount exceeds the business maximum'; END IF;
    NEW.discount_authorized_by:=actor.id;
    IF length(trim(COALESCE(NEW.discount_reason,'')))<3 THEN RAISE EXCEPTION 'A discount reason is required'; END IF;
   END IF;
  END IF;
  IF TG_TABLE_NAME='sale_items' THEN
   IF role_name<>'business_owner' THEN
    SELECT selling_price INTO listed FROM public.products WHERE id=NEW.product_id;
    IF NEW.discount<>0 OR NEW.unit_price IS DISTINCT FROM listed THEN
      IF NOT EXISTS(SELECT 1 FROM public.sales s WHERE s.id=NEW.sale_id AND s.discount_authorized_by IS NOT NULL) THEN RAISE EXCEPTION 'Owner approval is required for price changes'; END IF;
    END IF;
   END IF;
  END IF;
  IF role_name='cashier' THEN
   IF TG_TABLE_NAME='inventory' THEN
    IF TG_OP<>'UPDATE' OR NEW.original_device_timestamp IS NULL OR NEW.quantity>OLD.quantity THEN RAISE EXCEPTION 'Cashiers cannot adjust stock'; END IF;
    SELECT sum(i.quantity) INTO sold FROM public.sale_items i JOIN public.sales s ON s.id=i.sale_id WHERE s.cashier_id=auth.uid() AND s.organization_id=NEW.organization_id AND s.created_at=NEW.original_device_timestamp AND i.product_id=NEW.product_id AND i.warehouse_id=NEW.warehouse_id;
    IF sold IS NULL OR NEW.quantity<>greatest(0,OLD.quantity-sold) OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_type='inventory_ledger' AND reference_id=NEW.id AND original_device_timestamp=NEW.original_device_timestamp) THEN RAISE EXCEPTION 'Stock change must match an unreconciled cashier sale'; END IF;
    IF (to_jsonb(NEW)-ARRAY['quantity','updated_at','original_device_timestamp']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['quantity','updated_at','original_device_timestamp']) THEN RAISE EXCEPTION 'Cashiers cannot edit inventory'; END IF;
   END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_discounted_sale() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.discount<=0 THEN RETURN NEW; END IF;
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values,reason) VALUES(NEW.organization_id,NEW.discount_authorized_by,'GIVE_DISCOUNT','sale',NEW.id,jsonb_build_object('discount',NEW.discount,'subtotal',NEW.subtotal,'request_id',NEW.discount_request_id,'cashier_id',NEW.cashier_id),NEW.discount_reason);
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,staff_user_id,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  SELECT NEW.organization_id,u.id,'business_owner',NEW.cashier_id,'discount_given','Discount applied',format('A discount of NGN %s was applied to sale %s.',NEW.discount,NEW.invoice_number),format('A discount of NGN %s was applied to sale %s.',NEW.discount,NEW.invoice_number),'info','sale',NEW.id,'discount-given:'||NEW.id||':'||u.id,jsonb_build_object('sale_id',NEW.id,'discount',NEW.discount,'cashier_id',NEW.cashier_id,'authorized_by',NEW.discount_authorized_by)
  FROM public.users u WHERE u.organization_id=NEW.organization_id AND u.role='business_owner' AND u.status='active' ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_discounted_sale ON public.sales;
CREATE TRIGGER audit_discounted_sale AFTER INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.audit_discounted_sale();

COMMIT;

-- Verification query:
-- SELECT json_build_object('request_table',to_regclass('public.discount_requests') IS NOT NULL,'guard',position('discount_request_id' in pg_get_functiondef('track_private.guard_financial_change()'::regprocedure))>0,'sale_columns',(SELECT json_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name LIKE 'discount_%'));
