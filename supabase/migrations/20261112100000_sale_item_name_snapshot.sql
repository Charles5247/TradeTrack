BEGIN;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_name_snapshot text;

-- Existing sales predate snapshots. Their current catalog names are the best
-- recoverable names; future sales retain the name recorded at checkout.
DROP TRIGGER IF EXISTS item_immutable ON public.sale_items;
UPDATE public.sale_items AS item
SET product_name_snapshot = product.name
FROM public.products AS product, public.sales AS sale
WHERE item.product_id = product.id
  AND item.sale_id = sale.id
  AND product.organization_id = sale.organization_id
  AND item.product_name_snapshot IS NULL;
CREATE TRIGGER item_immutable BEFORE UPDATE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();

CREATE OR REPLACE FUNCTION track_private.snapshot_sale_item_name()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  SELECT product.name INTO NEW.product_name_snapshot
  FROM public.products AS product
  JOIN public.sales AS sale ON sale.id = NEW.sale_id
  WHERE product.id = NEW.product_id
    AND product.organization_id = sale.organization_id;
  IF NEW.product_name_snapshot IS NULL THEN
    RAISE EXCEPTION 'Sale product is unavailable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS snapshot_sale_item_name ON public.sale_items;
CREATE TRIGGER snapshot_sale_item_name BEFORE INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION track_private.snapshot_sale_item_name();

COMMIT;
