BEGIN;
-- Approved catalogue changes; preserve prices and existing entitlements.
UPDATE public.subscription_plans SET max_products = 1000
WHERE id = 'b4000000-0000-0000-0000-000000000004';
UPDATE public.subscription_plans SET features = (
 SELECT jsonb_agg(DISTINCT feature ORDER BY feature)
 FROM jsonb_array_elements_text(COALESCE(features, '[]'::jsonb) || '["purchase_orders","low_stock_alerts"]'::jsonb) AS f(feature)
) WHERE id = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
CREATE SCHEMA IF NOT EXISTS track_private;
CREATE OR REPLACE FUNCTION track_private.guard_trial_product_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE trial_end timestamptz; product_count bigint;
BEGIN
  -- Serialize product additions for this business, including bulk imports.
  SELECT trial_ends_at INTO trial_end FROM public.organizations
    WHERE id=NEW.organization_id FOR UPDATE;
  IF trial_end > statement_timestamp() AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions WHERE organization_id=NEW.organization_id
      AND status='active' AND starts_at<=statement_timestamp() AND expires_at>statement_timestamp()
  ) THEN
    SELECT count(*) INTO product_count FROM public.products WHERE organization_id=NEW.organization_id;
    IF product_count >= 1000 AND NOT EXISTS (SELECT 1 FROM public.products WHERE id=NEW.id) THEN
      RAISE EXCEPTION 'Trial product limit reached (1000 products)';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_trial_product_limit() FROM PUBLIC;
DROP TRIGGER IF EXISTS trial_product_limit ON public.products;
CREATE TRIGGER trial_product_limit BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION track_private.guard_trial_product_limit();


COMMIT;
