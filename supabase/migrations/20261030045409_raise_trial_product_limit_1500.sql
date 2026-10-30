BEGIN;

CREATE SCHEMA IF NOT EXISTS track_private;

-- The hidden signup-trial row is stable by id even when its display name differs
-- between hosted environments. Existing trial subscriptions reference this row.
UPDATE public.subscription_plans
SET max_products = 1500
WHERE id = 'b4000000-0000-0000-0000-000000000004';

CREATE OR REPLACE FUNCTION track_private.guard_trial_product_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  trial_end timestamptz;
  product_count bigint;
BEGIN
  SELECT trial_ends_at INTO trial_end
  FROM public.organizations
  WHERE id = NEW.organization_id
  FOR UPDATE;

  IF trial_end > statement_timestamp() AND NOT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE organization_id = NEW.organization_id
      AND status = 'active'
      AND starts_at <= statement_timestamp()
      AND expires_at > statement_timestamp()
  ) THEN
    SELECT count(*) INTO product_count
    FROM public.products
    WHERE organization_id = NEW.organization_id;

    IF product_count >= 1500 AND NOT EXISTS (
      SELECT 1 FROM public.products WHERE id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Trial product limit reached (1500 products)';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION track_private.guard_trial_product_limit() FROM PUBLIC;
DROP TRIGGER IF EXISTS trial_product_limit ON public.products;
CREATE TRIGGER trial_product_limit
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION track_private.guard_trial_product_limit();

COMMIT;

-- Live verification query (run separately after applying this migration):
-- SELECT
--   (SELECT max_products FROM public.subscription_plans
--     WHERE id = 'b4000000-0000-0000-0000-000000000004') AS trial_max_products,
--   position('1500' IN pg_get_functiondef(
--     'track_private.guard_trial_product_limit()'::regprocedure
--   )) > 0 AS trigger_enforces_1500,
--   (SELECT jsonb_build_object(
--      'price', price,
--      'max_products', max_products,
--      'max_cashiers', max_cashiers,
--      'max_warehouses', max_warehouses
--    ) FROM public.subscription_plans WHERE lower(name) = 'business' AND is_active LIMIT 1) AS business_unchanged;
