-- Financial cancellation, import reversal, and debt forgiveness require the
-- merchant's business-owner account. Recording real credit payments remains
-- available to managers. Guard the writes beneath all API and RPC entry points.
BEGIN;

CREATE FUNCTION track_private.require_owner_for_irreversible_action()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.organization_id = NEW.organization_id
      AND u.role = 'business_owner'
      AND u.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Business owner permission required';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.require_owner_for_irreversible_action() FROM PUBLIC;

CREATE TRIGGER owner_only_financial_reversal
  BEFORE INSERT ON public.financial_reversals
  FOR EACH ROW EXECUTE FUNCTION track_private.require_owner_for_irreversible_action();

CREATE TRIGGER owner_only_import_reversal
  BEFORE INSERT ON public.import_reversals
  FOR EACH ROW EXECUTE FUNCTION track_private.require_owner_for_irreversible_action();

CREATE TRIGGER owner_only_credit_write_off
  BEFORE INSERT ON public.customer_credit_settlements
  FOR EACH ROW WHEN (NEW.kind = 'write_off')
  EXECUTE FUNCTION track_private.require_owner_for_irreversible_action();

COMMIT;
