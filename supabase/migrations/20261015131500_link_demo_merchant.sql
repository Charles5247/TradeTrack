-- Repair the existing seeded demo organization without recreating accounts
-- or claiming identity verification. Safe to run more than once.
INSERT INTO public.merchants
  (organization_id, business_name, business_type, status, verification_status,
   contact_name, contact_email, notes)
SELECT o.id, o.name, 'retail', 'active', 'unverified', u.full_name, u.email,
       'Existing demonstration organization; linked to merchant dashboard without asserting identity verification.'
FROM public.organizations o
JOIN public.users u ON u.organization_id = o.id AND u.role = 'business_owner'
WHERE o.id = '11111111-1111-1111-1111-111111111111'
AND NOT EXISTS (SELECT 1 FROM public.merchants m WHERE m.organization_id = o.id);
