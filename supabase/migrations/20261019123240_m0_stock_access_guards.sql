-- M0: retain the existing authorization predicates, but never authorize an
-- inactive account. Existing function ownership and EXECUTE grants survive.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_user_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid() AND status = 'active'
$$;
CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.users WHERE id = auth.uid() AND status = 'active'
$$;
CREATE OR REPLACE FUNCTION public.is_admin_or_above() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role IN ('platform_owner', 'business_owner', 'admin') FROM public.users WHERE id = auth.uid() AND status = 'active'
$$;
CREATE OR REPLACE FUNCTION public.is_business_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role = 'business_owner' FROM public.users WHERE id = auth.uid() AND status = 'active'
$$;
CREATE OR REPLACE FUNCTION public.is_platform_owner() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role = 'platform_owner' FROM public.users WHERE id = auth.uid() AND status = 'active'
$$;
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role = 'super_admin' FROM public.users WHERE id = auth.uid() AND status = 'active'
$$;

-- NOT VALID preserves historical records for an explicit audit/repair while
-- rejecting new cross-business relationships. Do not silently rewrite history.
ALTER TABLE public.inventory ADD CONSTRAINT inventory_product_tenant_fk
  FOREIGN KEY (organization_id, product_id) REFERENCES public.products(organization_id, id) NOT VALID;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_warehouse_tenant_fk
  FOREIGN KEY (organization_id, warehouse_id) REFERENCES public.warehouses(organization_id, id) NOT VALID;
ALTER TABLE public.sales ADD CONSTRAINT sales_cashier_tenant_fk
  FOREIGN KEY (organization_id, cashier_id) REFERENCES public.users(organization_id, id) NOT VALID;
ALTER TABLE public.sales ADD CONSTRAINT sales_warehouse_tenant_fk
  FOREIGN KEY (organization_id, warehouse_id) REFERENCES public.warehouses(organization_id, id) NOT VALID;

CREATE FUNCTION track_private.guard_sale_item_tenant() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE business uuid; location uuid;
BEGIN
  SELECT organization_id, warehouse_id INTO business, location FROM public.sales WHERE id = NEW.sale_id;
  IF business IS NULL OR NEW.warehouse_id IS DISTINCT FROM location
    OR NOT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.product_id AND organization_id = business)
    OR NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = NEW.warehouse_id AND organization_id = business) THEN
    RAISE EXCEPTION 'Sale item product and location must belong to the sale business and location';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_sale_item_tenant() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sale_item_tenant_guard BEFORE INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION track_private.guard_sale_item_tenant();
COMMIT;
