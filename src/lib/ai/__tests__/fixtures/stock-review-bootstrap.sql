-- Disposable PGlite/native PostgreSQL fixture only. These IDs and the 600-second
-- review TTL are synthetic test inputs, not merchant policy or production data.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA auth;
CREATE SCHEMA track_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE public.organizations(id uuid PRIMARY KEY,settings jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.users(id uuid PRIMARY KEY,organization_id uuid REFERENCES public.organizations(id),role text,status text DEFAULT 'active');
CREATE TABLE public.products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,sku text NOT NULL,stock_unit text NOT NULL DEFAULT 'piece',barcode text,status text DEFAULT 'active',
  medical_stock_managed boolean DEFAULT false,selling_price numeric(12,2) NOT NULL DEFAULT 0,cost_price numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id),UNIQUE(organization_id,sku));
CREATE TABLE public.warehouses(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,is_main boolean DEFAULT false,created_at timestamptz DEFAULT now());
CREATE TABLE public.inventory(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),organization_id uuid NOT NULL REFERENCES public.organizations(id),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,min_stock_level integer DEFAULT 5,updated_at timestamptz DEFAULT now(),UNIQUE(product_id,warehouse_id));
CREATE TABLE public.inventory_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES public.organizations(id),
  product_id uuid REFERENCES public.products(id),warehouse_id uuid REFERENCES public.warehouses(id),movement_type text,quantity integer,
  reference_id uuid,reference_type text,notes text,created_by uuid REFERENCES public.users(id));
CREATE TABLE public.purchase_orders(id uuid PRIMARY KEY,organization_id uuid,status text,received_by uuid,received_at timestamptz);
CREATE TABLE public.purchase_order_items(id uuid PRIMARY KEY,purchase_order_id uuid,product_id uuid,
  quantity_ordered integer,quantity_received integer DEFAULT 0,unit_cost numeric(12,2));
CREATE TABLE public.subscription_plans(id uuid PRIMARY KEY,max_products integer);
CREATE TABLE public.subscriptions(id uuid PRIMARY KEY,organization_id uuid REFERENCES public.organizations(id),
  plan_id uuid REFERENCES public.subscription_plans(id),status text,created_at timestamptz DEFAULT now(),expires_at timestamptz);
CREATE TABLE public.ai_jobs(id uuid PRIMARY KEY,organization_id uuid REFERENCES public.organizations(id),user_id uuid REFERENCES public.users(id),
  kind text NOT NULL,status text NOT NULL DEFAULT 'pending',result jsonb NOT NULL DEFAULT '{}',approved_at timestamptz,import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,user_id uuid,
  action text,resource_type text,resource_id uuid,old_values jsonb,new_values jsonb,reason text,correlation_id uuid);
CREATE FUNCTION public.get_user_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT organization_id FROM public.users WHERE id=auth.uid() $$;
CREATE FUNCTION public.is_admin_or_above() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT role IN ('business_owner','admin') FROM public.users WHERE id=auth.uid() $$;
CREATE FUNCTION public.verify_business_subscription() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('organization_id',u.organization_id,'active',COALESCE(s.status='active' AND s.expires_at>statement_timestamp(),false),
    'server_time',statement_timestamp(),'trial_ends_at',NULL,'plan_id',s.plan_id,'valid_until',s.expires_at)
  FROM public.users u LEFT JOIN public.subscriptions s ON s.organization_id=u.organization_id WHERE u.id=auth.uid()
$$;
CREATE FUNCTION track_private.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable record'; END $$;
CREATE FUNCTION track_private.capture_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,old_values,new_values)
    VALUES(NEW.organization_id,auth.uid(),TG_OP,TG_TABLE_NAME,NEW.id,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER ai_audit AFTER INSERT OR UPDATE ON public.ai_jobs FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit();
-- Same upstream finish semantics/audit text, so the migration's privacy
-- adjustment is exercised through the actual public finish operation.
CREATE FUNCTION public.finish_ai_job(job uuid,output jsonb,failed boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; BEGIN
  org:=track_private.assert_ai_access();
  UPDATE public.ai_jobs SET result=output,status=CASE WHEN failed THEN 'failed' ELSE 'ready' END
    WHERE id=job AND organization_id=org AND user_id=auth.uid() AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending AI request not found'; END IF;
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values)
    VALUES(org,auth.uid(),CASE WHEN failed THEN 'AI_FAILED' ELSE 'AI_SUGGESTION' END,'ai_jobs',job,output);
END $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON public.users,public.ai_jobs TO authenticated;
REVOKE ALL ON FUNCTION public.finish_ai_job(uuid,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_ai_job(uuid,jsonb,boolean) TO authenticated;

INSERT INTO public.organizations VALUES
 ('10000000-0000-0000-0000-000000000001','{"ai_stock_review_ttl_seconds":600}'),
 ('10000000-0000-0000-0000-000000000002','{"ai_stock_review_ttl_seconds":600}');
INSERT INTO public.users VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','business_owner','active'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','admin','active'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','cashier','active'),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','business_owner','active');
INSERT INTO public.subscription_plans VALUES('b3000000-0000-0000-0000-000000000003',100);
INSERT INTO public.subscriptions(id,organization_id,plan_id,status,expires_at) VALUES
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000003','active',now()+interval '1 day'),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','b3000000-0000-0000-0000-000000000003','active',now()+interval '1 day');
INSERT INTO public.products(id,organization_id,name,sku,stock_unit,cost_price) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Rice','RICE','bag',100),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Oil','OIL','bottle',100),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Foreign','FOREIGN','piece',100);
INSERT INTO public.warehouses(id,organization_id,name,is_main) VALUES
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Main',true),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Annex',false),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Foreign',true);
INSERT INTO public.inventory(id,organization_id,product_id,warehouse_id,quantity) VALUES
 ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',10),
 ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',5);
SELECT set_config('test.uid','20000000-0000-0000-0000-000000000001',false);
