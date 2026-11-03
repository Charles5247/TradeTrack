-- Keep older deployments compatible with the shared product form.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_unit text NOT NULL DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS variant_size text,
  ADD COLUMN IF NOT EXISTS variant_colour text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS units_per_pack integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.products'::regclass AND conname = 'product_units_per_pack_valid') THEN
    ALTER TABLE public.products ADD CONSTRAINT product_units_per_pack_valid CHECK (units_per_pack BETWEEN 1 AND 100000);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_product_stock_unit() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.stock_unit IS DISTINCT FROM OLD.stock_unit AND (
    EXISTS (SELECT 1 FROM public.inventory WHERE product_id = OLD.id AND quantity <> 0)
    OR EXISTS (SELECT 1 FROM public.sale_items WHERE product_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.inventory_movements WHERE product_id = OLD.id)
  ) THEN
    RAISE EXCEPTION 'Create a new product to change the selling unit of an item with stock history';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_product_stock_unit() FROM PUBLIC;
DROP TRIGGER IF EXISTS guard_product_stock_unit ON public.products;
CREATE TRIGGER guard_product_stock_unit BEFORE UPDATE OF stock_unit ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock_unit();

-- Direct inserts and imports also receive a unique code if they omit one.
CREATE OR REPLACE FUNCTION public.assign_product_sku() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NULLIF(trim(NEW.sku), '') IS NULL THEN
    NEW.sku := 'AUTO-' || NEW.id::text;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_product_sku() FROM PUBLIC;
DROP TRIGGER IF EXISTS assign_product_sku ON public.products;
CREATE TRIGGER assign_product_sku BEFORE INSERT OR UPDATE OF sku ON public.products
FOR EACH ROW EXECUTE FUNCTION public.assign_product_sku();
