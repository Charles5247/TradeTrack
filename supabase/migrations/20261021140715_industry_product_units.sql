-- Additive only: preserve existing whole-quantity inventory and offline payloads.
ALTER TABLE public.products
 ADD COLUMN stock_unit text NOT NULL DEFAULT 'piece' CHECK (stock_unit IN ('piece','pair','pack','carton','bag','g','kg','mL','L','cm','m','tablet','bottle','vial')),
 ADD COLUMN variant_size text CHECK (length(variant_size)<=60),
 ADD COLUMN variant_colour text CHECK (length(variant_colour)<=60),
 ADD COLUMN model text CHECK (length(model)<=100);

-- Never reinterpret old stock or historic sales by changing a product's unit.
CREATE FUNCTION public.guard_product_stock_unit() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.stock_unit IS DISTINCT FROM OLD.stock_unit AND (
  EXISTS(SELECT 1 FROM public.inventory WHERE product_id=OLD.id AND quantity<>0)
  OR EXISTS(SELECT 1 FROM public.sale_items WHERE product_id=OLD.id)
  OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE product_id=OLD.id)
 ) THEN
  RAISE EXCEPTION 'Create a new SKU to change the selling unit of a product with stock history';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_product_stock_unit() FROM PUBLIC;
CREATE TRIGGER guard_product_stock_unit BEFORE UPDATE OF stock_unit ON public.products
 FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock_unit();
