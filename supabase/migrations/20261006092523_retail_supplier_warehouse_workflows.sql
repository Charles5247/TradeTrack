BEGIN;

-- Composite references prevent a relationship from crossing business boundaries.
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_org_id_key UNIQUE (organization_id, id);
ALTER TABLE public.products ADD CONSTRAINT products_org_id_key UNIQUE (organization_id, id);
ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_org_id_key UNIQUE (organization_id, id);
ALTER TABLE public.users ADD CONSTRAINT users_org_id_key UNIQUE (organization_id, id);

CREATE TABLE public.supplier_products (
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  supplier_id uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (supplier_id, product_id),
  FOREIGN KEY (organization_id, supplier_id) REFERENCES public.suppliers(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, product_id) REFERENCES public.products(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX supplier_products_org_product_idx ON public.supplier_products(organization_id,product_id);
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_products_read ON public.supplier_products FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.get_user_org_id()));
CREATE POLICY supplier_products_manage ON public.supplier_products FOR ALL TO authenticated
  USING (organization_id = (SELECT public.get_user_org_id()) AND (SELECT public.is_admin_or_above()))
  WITH CHECK (organization_id = (SELECT public.get_user_org_id()) AND (SELECT public.is_admin_or_above()));

CREATE TABLE public.warehouse_staff (
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  warehouse_id uuid NOT NULL,
  user_id uuid NOT NULL,
  assignment_role text NOT NULL CHECK (assignment_role IN ('manager','cashier')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id,user_id),
  FOREIGN KEY (organization_id, warehouse_id) REFERENCES public.warehouses(organization_id,id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, user_id) REFERENCES public.users(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX warehouse_staff_org_user_idx ON public.warehouse_staff(organization_id,user_id);
ALTER TABLE public.warehouse_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY warehouse_staff_read ON public.warehouse_staff FOR SELECT TO authenticated
  USING (organization_id = (SELECT public.get_user_org_id()));
CREATE POLICY warehouse_staff_owner_manage ON public.warehouse_staff FOR ALL TO authenticated
  USING (organization_id = (SELECT public.get_user_org_id()) AND (SELECT public.is_business_owner()))
  WITH CHECK (organization_id = (SELECT public.get_user_org_id()) AND (SELECT public.is_business_owner()) AND EXISTS (
    SELECT 1 FROM public.users u WHERE u.id=user_id AND u.organization_id=warehouse_staff.organization_id
      AND u.status='active' AND ((assignment_role='manager' AND u.role='admin') OR (assignment_role='cashier' AND u.role='cashier'))
  ));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.supplier_products,public.warehouse_staff TO authenticated;
REVOKE ALL ON public.supplier_products,public.warehouse_staff FROM anon;
CREATE FUNCTION track_private.audit_operational_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry jsonb;
BEGIN
  entry := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,old_values,new_values,reason)
  VALUES((entry->>'organization_id')::uuid,auth.uid(),TG_OP,TG_TABLE_NAME,(entry->>'id')::uuid,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END,'Supplier catalog or location staffing change');
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION track_private.audit_operational_link() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER supplier_products_audit AFTER INSERT OR UPDATE OR DELETE ON public.supplier_products FOR EACH ROW EXECUTE FUNCTION track_private.audit_operational_link();
CREATE TRIGGER warehouse_staff_audit AFTER INSERT OR UPDATE OR DELETE ON public.warehouse_staff FOR EACH ROW EXECUTE FUNCTION track_private.audit_operational_link();
COMMIT;
