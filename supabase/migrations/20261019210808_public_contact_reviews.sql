BEGIN;
CREATE TABLE public.contact_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 150),
 business_name text NOT NULL CHECK(length(business_name) BETWEEN 2 AND 200),
 phone text NOT NULL CHECK(length(phone) BETWEEN 7 AND 30),
 message text NOT NULL CHECK(length(message) BETWEEN 5 AND 5000),
 email_status text NOT NULL DEFAULT 'pending' CHECK(email_status IN ('pending','sent')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_messages FROM anon,authenticated;
GRANT ALL ON public.contact_messages TO service_role;
GRANT SELECT ON public.contact_messages TO authenticated;
CREATE POLICY contact_owner_read ON public.contact_messages FOR SELECT TO authenticated
 USING ((SELECT public.is_platform_owner()));

CREATE TABLE public.merchant_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id uuid UNIQUE REFERENCES public.users(id),
 merchant_name text NOT NULL CHECK(length(merchant_name) BETWEEN 2 AND 150),
 business_name text NOT NULL CHECK(length(business_name) BETWEEN 2 AND 200),
 location text NOT NULL CHECK(length(location) BETWEEN 2 AND 200),
 review text NOT NULL CHECK(length(review) BETWEEN 5 AND 3000),
 rating integer CHECK(rating BETWEEN 1 AND 5),
 admin_added boolean NOT NULL DEFAULT false,
 deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.merchant_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_reviews FROM anon,authenticated;
GRANT SELECT ON public.merchant_reviews TO anon,authenticated;
GRANT INSERT,UPDATE ON public.merchant_reviews TO authenticated;
GRANT ALL ON public.merchant_reviews TO service_role;
CREATE POLICY reviews_public_read ON public.merchant_reviews FOR SELECT TO anon USING (deleted_at IS NULL);
CREATE POLICY reviews_read ON public.merchant_reviews FOR SELECT TO authenticated
 USING (deleted_at IS NULL OR author_id=(SELECT auth.uid()) OR (SELECT public.is_platform_owner()));
CREATE POLICY reviews_create ON public.merchant_reviews FOR INSERT TO authenticated
 WITH CHECK ((public.is_platform_owner() AND admin_added) OR
 (author_id=auth.uid() AND NOT admin_added AND deleted_at IS NULL AND EXISTS (
   SELECT 1 FROM public.users WHERE id=auth.uid() AND role='business_owner' AND status='active')));
CREATE POLICY reviews_edit ON public.merchant_reviews FOR UPDATE TO authenticated
 USING (public.is_platform_owner() OR (author_id=auth.uid() AND deleted_at IS NULL AND NOT admin_added))
 WITH CHECK (public.is_platform_owner() OR (author_id=auth.uid() AND deleted_at IS NULL AND NOT admin_added));
CREATE INDEX merchant_reviews_public_date ON public.merchant_reviews(created_at DESC) WHERE deleted_at IS NULL;
COMMIT;
