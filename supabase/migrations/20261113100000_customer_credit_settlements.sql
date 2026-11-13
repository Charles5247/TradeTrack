BEGIN;

CREATE TABLE public.customer_credit_settlements (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sale_id uuid REFERENCES public.sales(id),
  historical_sale_id uuid REFERENCES public.historical_sales(id),
  kind text NOT NULL CHECK (kind IN ('payment', 'write_off')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text CHECK (payment_method IN ('cash', 'transfer', 'pos_terminal', 'split')),
  reference text,
  reason text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_settlement_one_source CHECK ((sale_id IS NULL) <> (historical_sale_id IS NULL)),
  CONSTRAINT credit_settlement_method CHECK (
    (kind = 'payment' AND payment_method IS NOT NULL)
    OR (kind = 'write_off' AND payment_method IS NULL AND length(trim(coalesce(reason, ''))) >= 3)
  )
);
CREATE INDEX customer_credit_settlements_sale_idx ON public.customer_credit_settlements(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX customer_credit_settlements_historical_idx ON public.customer_credit_settlements(historical_sale_id) WHERE historical_sale_id IS NOT NULL;
CREATE INDEX customer_credit_settlements_org_created_idx ON public.customer_credit_settlements(organization_id, created_at DESC);
ALTER TABLE public.customer_credit_settlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_settlement_read_org ON public.customer_credit_settlements
  FOR SELECT TO authenticated USING (
    organization_id = (SELECT public.get_user_org_id())
    AND (SELECT public.get_user_role()) IN ('business_owner', 'admin')
  );
GRANT SELECT ON public.customer_credit_settlements TO authenticated;
CREATE TRIGGER credit_settlement_immutable BEFORE UPDATE OR DELETE ON public.customer_credit_settlements
  FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();
CREATE TRIGGER credit_settlement_audit AFTER INSERT ON public.customer_credit_settlements
  FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit();

CREATE FUNCTION public.record_customer_credit_settlement(
  p_request_id uuid, p_sale_id uuid, p_imported boolean,
  p_kind text, p_amount numeric, p_payment_method text DEFAULT NULL,
  p_reference text DEFAULT NULL, p_reason text DEFAULT NULL
) RETURNS public.customer_credit_settlements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor public.users; existing public.customer_credit_settlements;
  source_org uuid; source_total numeric; source_paid numeric; source_status text;
  settled numeric; remaining numeric; result public.customer_credit_settlements;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = auth.uid() AND status = 'active';
  IF actor.id IS NULL OR actor.role NOT IN ('business_owner', 'admin') THEN
    RAISE EXCEPTION 'Owner or manager access required';
  END IF;
  IF p_request_id IS NULL OR p_sale_id IS NULL OR p_imported IS NULL
     OR p_kind IS NULL OR p_kind NOT IN ('payment', 'write_off') OR p_amount IS NULL
     OR p_amount <= 0 OR p_amount > 9999999999.99 THEN
    RAISE EXCEPTION 'Invalid credit settlement';
  END IF;
  SELECT * INTO existing FROM public.customer_credit_settlements WHERE id = p_request_id;
  IF FOUND THEN
    IF existing.organization_id <> actor.organization_id
       OR existing.kind <> p_kind OR existing.amount <> p_amount
       OR existing.sale_id IS DISTINCT FROM (CASE WHEN p_imported THEN NULL ELSE p_sale_id END)
       OR existing.historical_sale_id IS DISTINCT FROM (CASE WHEN p_imported THEN p_sale_id ELSE NULL END) THEN
      RAISE EXCEPTION 'Settlement reference was already used';
    END IF;
    RETURN existing;
  END IF;
  IF p_imported THEN
    SELECT organization_id, total, amount_paid, status
    INTO source_org, source_total, source_paid, source_status
    FROM public.historical_sales WHERE id = p_sale_id FOR UPDATE;
    IF source_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'Historical sale is not active'; END IF;
  ELSE
    SELECT organization_id, total, amount_paid, status
    INTO source_org, source_total, source_paid, source_status
    FROM public.sales WHERE id = p_sale_id FOR UPDATE;
    IF source_status IS DISTINCT FROM 'completed' OR EXISTS (
      SELECT 1 FROM public.financial_reversals
      WHERE sale_id = p_sale_id AND kind IN ('void', 'refund', 'return')
    ) THEN RAISE EXCEPTION 'Sale is cancelled or unavailable'; END IF;
  END IF;
  IF source_org IS DISTINCT FROM actor.organization_id THEN RAISE EXCEPTION 'Sale is outside your business'; END IF;
  SELECT coalesce(sum(amount), 0) INTO settled
  FROM public.customer_credit_settlements
  WHERE (sale_id = CASE WHEN p_imported THEN NULL ELSE p_sale_id END AND NOT p_imported)
     OR (historical_sale_id = CASE WHEN p_imported THEN p_sale_id ELSE NULL END AND p_imported);
  remaining := source_total - source_paid - settled;
  IF remaining <= 0 OR p_amount > remaining THEN RAISE EXCEPTION 'Amount exceeds the remaining credit balance'; END IF;
  IF p_kind = 'payment' AND (p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'transfer', 'pos_terminal', 'split')) THEN
    RAISE EXCEPTION 'Choose how the customer paid';
  END IF;
  IF p_kind = 'write_off' AND (p_amount <> remaining OR length(trim(coalesce(p_reason, ''))) < 3) THEN
    RAISE EXCEPTION 'Write off the full remaining balance and provide a reason';
  END IF;
  INSERT INTO public.customer_credit_settlements
    (id, organization_id, sale_id, historical_sale_id, kind, amount, payment_method, reference, reason, created_by)
  VALUES (p_request_id, actor.organization_id,
    CASE WHEN p_imported THEN NULL ELSE p_sale_id END,
    CASE WHEN p_imported THEN p_sale_id ELSE NULL END,
    p_kind, p_amount, CASE WHEN p_kind = 'payment' THEN p_payment_method ELSE NULL END,
    nullif(trim(p_reference), ''), nullif(trim(p_reason), ''), actor.id)
  RETURNING * INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_customer_credit_settlement(uuid,uuid,boolean,text,numeric,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_credit_settlement(uuid,uuid,boolean,text,numeric,text,text,text) TO authenticated;

COMMIT;
