-- Private, organization-scoped commercial offer. It is excluded from the public plan catalog.
CREATE TABLE IF NOT EXISTS public.private_subscription_offers (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  monthly_price numeric(12,2) NOT NULL CHECK (monthly_price > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_subscription_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_subscription_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_subscription_offers TO service_role;

-- Copy the current Business capabilities as a starting entitlement set; this
-- private plan can be adjusted without changing the public Business package.
INSERT INTO public.subscription_plans (
  id, name, price, currency, billing_cycle, max_cashiers, max_products,
  max_warehouses, features, is_active, is_popular, trial_days
)
SELECT 'b6000000-0000-0000-0000-000000000006'::uuid,
  'Marvellous San private agreement', 45000, 'NGN', 'monthly',
  GREATEST(max_cashiers, 12), max_products, GREATEST(max_warehouses, 3),
  features, false, false, 0
FROM public.subscription_plans
WHERE id = 'b4000000-0000-0000-0000-000000000004'::uuid
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.private_subscription_offers (organization_id, plan_id, monthly_price)
SELECT o.id, 'b6000000-0000-0000-0000-000000000006'::uuid, 45000
FROM public.organizations o
WHERE lower(trim(o.name)) = lower('Marvellous San General Enterprise')
  AND (SELECT count(*) FROM public.organizations WHERE lower(trim(name)) = lower('Marvellous San General Enterprise')) = 1
  AND EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = 'b6000000-0000-0000-0000-000000000006'::uuid)
ON CONFLICT (organization_id) DO NOTHING;
