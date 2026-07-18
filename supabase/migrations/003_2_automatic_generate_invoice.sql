-- Drop the existing function first
DROP FUNCTION IF EXISTS public.generate_invoice_number();

-- Then recreate it
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('public.invoice_number_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;