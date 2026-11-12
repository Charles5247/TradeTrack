BEGIN;

ALTER TABLE public.subscription_checkouts
  ADD COLUMN IF NOT EXISTS renewal_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_automatic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payer_mobile text,
  ADD COLUMN IF NOT EXISTS payer_email text;

CREATE TABLE IF NOT EXISTS public.subscription_card_mandates (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly','quarterly','biannual','yearly')),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  encrypted_token text NOT NULL,
  token_hint text,
  mobile_number text NOT NULL,
  email_address text NOT NULL,
  zainbox_code text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test','live')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','action_required','disabled')),
  consented_by uuid NOT NULL REFERENCES public.users(id),
  consented_at timestamptz NOT NULL DEFAULT now(),
  pending_reference text UNIQUE,
  charge_requested_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_card_mandates_due_idx
  ON public.subscription_card_mandates(status, charge_requested_at)
  WHERE status = 'active';
ALTER TABLE public.subscription_card_mandates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_card_mandates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_card_mandates TO service_role;

-- Reserve one charge per organization/period. Only the service role can call this.
CREATE OR REPLACE FUNCTION public.claim_due_card_renewals(p_limit integer DEFAULT 20)
RETURNS TABLE(organization_id uuid, reference text, encrypted_token text,
  amount_kobo bigint, mobile_number text, email_address text, zainbox_code text, mode text)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE m public.subscription_card_mandates; ref text;
BEGIN
  FOR m IN
    SELECT mandate.* FROM public.subscription_card_mandates mandate
    JOIN LATERAL (
      SELECT s.plan_id, s.billing_cycle, s.expires_at, s.status
      FROM public.subscriptions s
      WHERE s.organization_id = mandate.organization_id
      ORDER BY s.created_at DESC LIMIT 1
    ) latest ON true
    WHERE mandate.status = 'active' AND mandate.pending_reference IS NULL
      AND mandate.mode = 'live' AND latest.status IN ('active','expired')
      AND latest.plan_id = mandate.plan_id AND latest.billing_cycle = mandate.billing_cycle
      AND latest.expires_at <= now() + interval '1 day'
    ORDER BY latest.expires_at
    FOR UPDATE OF mandate SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 0), 20)
  LOOP
    ref := 'TT-' || gen_random_uuid()::text;
    INSERT INTO public.subscription_checkouts
      (reference, organization_id, user_id, plan_id, plan_name, billing_cycle,
       amount_kobo, mode, zainbox_code, renewal_consent, is_automatic, payer_mobile, payer_email)
    SELECT ref, m.organization_id, m.consented_by, m.plan_id, p.name,
      m.billing_cycle, m.amount_kobo, m.mode, m.zainbox_code, true, true,
      m.mobile_number, m.email_address
    FROM public.subscription_plans p WHERE p.id = m.plan_id;
    UPDATE public.subscription_card_mandates mandate
      SET pending_reference = ref, updated_at = now()
      WHERE mandate.organization_id = m.organization_id;
    organization_id := m.organization_id;
    reference := ref;
    encrypted_token := m.encrypted_token;
    amount_kobo := m.amount_kobo;
    mobile_number := m.mobile_number;
    email_address := m.email_address;
    zainbox_code := m.zainbox_code;
    mode := m.mode;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.claim_due_card_renewals(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_card_renewals(integer) TO service_role;

COMMIT;
