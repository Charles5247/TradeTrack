-- An owner-approved checkout may sit in a device queue past the approval window.
-- Claiming the exact checkout while approval is live preserves that decision for
-- its eventual upload; the sale trigger still checks actor, cart and amount.
BEGIN;

ALTER TABLE public.discount_requests
  ADD COLUMN IF NOT EXISTS checkout_id uuid,
  ADD COLUMN IF NOT EXISTS checkout_claimed_at timestamptz;

-- The existing sale guard records sale_id in a BEFORE INSERT trigger. Check
-- that reference at transaction end, after the sale row has been inserted.
ALTER TABLE public.discount_requests
  ALTER CONSTRAINT discount_requests_sale_id_fkey DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX IF NOT EXISTS discount_requests_checkout_claim_unique
  ON public.discount_requests (checkout_id) WHERE checkout_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_discount_checkout(
  p_request_id uuid, p_checkout_id uuid, p_cart_hash text,
  p_cart_subtotal numeric, p_discount_amount numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor public.users;
  approval public.discount_requests;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = auth.uid() AND status = 'active';
  SELECT * INTO approval FROM public.discount_requests
    WHERE id = p_request_id FOR UPDATE;
  IF actor.id IS NULL OR approval.id IS NULL
     OR actor.id IS DISTINCT FROM approval.requester_id
     OR actor.organization_id IS DISTINCT FROM approval.organization_id
     OR approval.status <> 'approved' OR approval.used_at IS NOT NULL
     OR approval.cart_hash IS DISTINCT FROM p_cart_hash
     OR approval.cart_subtotal IS DISTINCT FROM p_cart_subtotal
     OR approval.discount_amount IS DISTINCT FROM p_discount_amount
     OR p_checkout_id IS NULL THEN
    RAISE EXCEPTION 'Discount approval cannot be claimed for this checkout';
  END IF;
  IF approval.checkout_id = p_checkout_id AND approval.checkout_claimed_at <= approval.expires_at THEN
    RETURN;
  END IF;
  IF approval.checkout_id IS NOT NULL OR approval.expires_at <= now() THEN
    RAISE EXCEPTION 'Discount approval expired or belongs to another checkout';
  END IF;
  UPDATE public.discount_requests SET checkout_id = p_checkout_id,
    checkout_claimed_at = now() WHERE id = p_request_id;
  INSERT INTO public.audit_logs
    (organization_id, user_id, action, resource_type, resource_id, new_values, reason)
  VALUES
    (actor.organization_id, actor.id, 'CLAIM_DISCOUNT_CHECKOUT', 'discount_request',
     p_request_id, jsonb_build_object('checkout_id', p_checkout_id,
       'cart_hash', p_cart_hash, 'discount_amount', p_discount_amount),
     approval.reason);
END $$;

REVOKE ALL ON FUNCTION public.claim_discount_checkout(uuid,uuid,text,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_discount_checkout(uuid,uuid,text,numeric,numeric) TO authenticated;

-- Preserve the current guard definition, including later inventory and sale
-- item fixes. Fail closed if its approval clause has changed unexpectedly.
DO $$
DECLARE
  definition text;
  old_clause text := 'approval.expires_at <= now()';
  new_clause text := '(approval.checkout_id IS NOT NULL AND approval.checkout_id IS DISTINCT FROM NEW.id) OR (approval.expires_at <= now() AND NOT (approval.checkout_id = NEW.id AND approval.checkout_claimed_at <= approval.expires_at))';
BEGIN
  definition := pg_get_functiondef('track_private.guard_financial_change()'::regprocedure);
  IF position(old_clause IN definition) = 0 THEN
    RAISE EXCEPTION 'Financial guard approval clause changed; review migration before applying';
  END IF;
  definition := replace(definition, old_clause, new_clause);
  EXECUTE definition;
END $$;

COMMIT;
