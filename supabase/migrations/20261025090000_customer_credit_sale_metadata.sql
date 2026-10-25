ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) NOT NULL DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS credit_authorized_by UUID REFERENCES public.users(id);

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_type_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_sale_type_check
  CHECK (sale_type IN ('retail', 'b2b', 'b2c'));

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_credit_authorization_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_credit_authorization_check
  CHECK (
    (payment_status = 'paid' AND credit_authorized_by IS NULL)
    OR (
      sale_type IN ('b2b', 'b2c')
      AND payment_status IN ('partial', 'unpaid')
      AND credit_authorized_by IS NOT NULL
    )
    OR (sale_type = 'retail' AND payment_status IN ('partial', 'unpaid'))
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_sales_org_sale_type
  ON public.sales(organization_id, sale_type, payment_status);

COMMENT ON COLUMN public.sales.sale_type IS
  'Customer sale channel: retail, b2b or b2c.';
COMMENT ON COLUMN public.sales.credit_authorized_by IS
  'User that authorized a payment_status=unpaid customer credit sale.';
