-- Add whole-unit textile and clothing selling units. Existing product units remain unchanged.
DO $$
DECLARE old_constraint record;
BEGIN
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass AND contype = 'c'
      AND conname IN ('products_stock_unit_check', 'products_stock_unit_supported')
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', old_constraint.conname);
  END LOOP;
  ALTER TABLE public.products ADD CONSTRAINT products_stock_unit_supported
    CHECK (stock_unit IN ('piece','pair','pack','carton','bag','g','kg','mL','L','cm','m','yard','bale','bundle','roll','dozen','set','tablet','bottle','vial'));
END $$;
