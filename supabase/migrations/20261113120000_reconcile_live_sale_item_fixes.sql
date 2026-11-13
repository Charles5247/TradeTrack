-- Reconciliation migration: records, in the repo, the SQL that was applied directly to the
-- live database on 13 Nov 2026 by the Supabase assistant (no migration-history row was created).
-- Safe to re-run: column is IF NOT EXISTS, functions are CREATE OR REPLACE, trigger is recreated,
-- backfill only touches rows whose snapshot is still NULL.
-- Fixes: (1) 'record "new" has no field "organization_id"' on sale_items inserts (the inventory-only
-- condition in guard_financial_change referenced NEW.organization_id for every table),
-- (2) missing sale_items.product_name_snapshot used by Sales History.
-- DO NOT replace guard_financial_change with an older definition (e.g. from 20261106112119_warehouse_memos.sql);
-- that reintroduces the bug.
BEGIN;

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS product_name_snapshot text;

CREATE OR REPLACE FUNCTION track_private.guard_financial_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  role_name text;
  allowed numeric;
  listed numeric;
  sold integer;
  actor public.users;
  org public.organizations;
  approval public.discount_requests;
  effective_percent numeric;
BEGIN
  SELECT * INTO actor FROM public.users WHERE id = auth.uid();
  role_name := actor.role;

  IF TG_TABLE_NAME = 'sales' AND TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - ARRAY['updated_at','official_invoice_number'])
         IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['updated_at','official_invoice_number']) THEN
    RAISE EXCEPTION 'Sales are immutable; use a reversal or payment correction';
  END IF;

  IF TG_TABLE_NAME = 'sales' THEN
    IF role_name <> 'business_owner' THEN
      IF NEW.cashier_id <> auth.uid() THEN
        RAISE EXCEPTION 'Invalid cashier';
      END IF;
      IF NEW.discount <> 0 THEN
        SELECT * INTO org FROM public.organizations WHERE id = NEW.organization_id;
        effective_percent := round(NEW.discount / NULLIF(NEW.subtotal, 0) * 100, 2);
        IF effective_percent > org.max_discount_percent THEN
          RAISE EXCEPTION 'Discount exceeds the business maximum';
        END IF;
        IF NEW.discount_request_id IS NOT NULL THEN
          SELECT * INTO approval FROM public.discount_requests WHERE id = NEW.discount_request_id FOR UPDATE;
          IF approval.status <> 'approved' OR approval.used_at IS NOT NULL OR approval.expires_at <= now()
             OR approval.requester_id <> auth.uid()
             OR approval.cart_hash IS DISTINCT FROM NEW.discount_cart_hash
             OR approval.cart_subtotal IS DISTINCT FROM NEW.subtotal
             OR approval.discount_amount IS DISTINCT FROM NEW.discount THEN
            RAISE EXCEPTION 'Discount approval is invalid, expired, used, or belongs to a changed cart';
          END IF;
          NEW.discount_authorized_by := approval.decider_id;
          UPDATE public.discount_requests
             SET used_at = now(), sale_id = NEW.id, status = 'approved'
           WHERE id = approval.id;
        ELSIF actor.can_give_discounts
              AND effective_percent <= COALESCE(actor.max_discount_percent, org.max_discount_percent) THEN
          NEW.discount_authorized_by := actor.id;
          NEW.discount_permission_snapshot := jsonb_build_object(
            'user_id', actor.id,
            'max_discount_percent', actor.max_discount_percent,
            'recorded_at', now()
          );
        ELSE
          RAISE EXCEPTION 'Owner approval is required for this discount';
        END IF;
        IF length(trim(COALESCE(NEW.discount_reason, ''))) < 3 THEN
          RAISE EXCEPTION 'A discount reason is required';
        END IF;
      END IF;
    ELSIF role_name = 'business_owner' AND NEW.discount <> 0 THEN
      SELECT * INTO org FROM public.organizations WHERE id = NEW.organization_id;
      effective_percent := round(NEW.discount / NULLIF(NEW.subtotal, 0) * 100, 2);
      IF effective_percent > org.max_discount_percent THEN
        RAISE EXCEPTION 'Discount exceeds the business maximum';
      END IF;
      NEW.discount_authorized_by := actor.id;
      IF length(trim(COALESCE(NEW.discount_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'A discount reason is required';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'sale_items' THEN
    IF role_name <> 'business_owner' THEN
      SELECT selling_price INTO listed FROM public.products WHERE id = NEW.product_id;
      IF NEW.discount <> 0 OR NEW.unit_price IS DISTINCT FROM listed THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.sales s
           WHERE s.id = NEW.sale_id AND s.discount_authorized_by IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'Owner approval is required for price changes';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Keep inventory-only NEW fields inside this nested guard. A compound AND
  -- expression can be reordered, exposing NEW.organization_id on sale_items.
  IF TG_TABLE_NAME = 'inventory' THEN
    IF current_setting('track.memo_write', true) = 'on'
       AND current_setting('track.memo_actor', true) = auth.uid()::text
       AND EXISTS (
         SELECT 1 FROM public.warehouse_memos wm
          WHERE wm.id = NULLIF(current_setting('track.memo_id', true), '')::uuid
            AND wm.organization_id = NEW.organization_id
            AND wm.warehouse_id = NEW.warehouse_id
            AND wm.status IN ('sent', 'submitted', 'approved')
       ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF role_name = 'cashier' AND TG_TABLE_NAME = 'inventory' THEN
    IF TG_OP <> 'UPDATE' OR NEW.original_device_timestamp IS NULL OR NEW.quantity > OLD.quantity THEN
      RAISE EXCEPTION 'Cashiers cannot adjust stock';
    END IF;
    SELECT sum(i.quantity) INTO sold
      FROM public.sale_items i
      JOIN public.sales s ON s.id = i.sale_id
     WHERE s.cashier_id = auth.uid()
       AND s.organization_id = NEW.organization_id
       AND s.created_at = NEW.original_device_timestamp
       AND i.product_id = NEW.product_id
       AND i.warehouse_id = NEW.warehouse_id;
    IF sold IS NULL
       OR NEW.quantity <> greatest(0, OLD.quantity - sold)
       OR EXISTS (
         SELECT 1 FROM public.inventory_movements
          WHERE reference_type = 'inventory_ledger'
            AND reference_id = NEW.id
            AND original_device_timestamp = NEW.original_device_timestamp
       ) THEN
      RAISE EXCEPTION 'Stock change must match an unreconciled cashier sale';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['quantity','updated_at','original_device_timestamp'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['quantity','updated_at','original_device_timestamp']) THEN
      RAISE EXCEPTION 'Cashiers cannot edit inventory';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION track_private.immutable_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'sale_items' AND TG_OP = 'UPDATE' THEN
    IF OLD.product_name_snapshot IS NULL
       AND NEW.product_name_snapshot IS NOT NULL
       AND (to_jsonb(NEW) - 'product_name_snapshot')
           IS NOT DISTINCT FROM
           (to_jsonb(OLD) - 'product_name_snapshot')
       AND EXISTS (
         SELECT 1
           FROM public.products p
           JOIN public.sales s ON s.id = NEW.sale_id
                               AND s.organization_id = p.organization_id
          WHERE p.id = NEW.product_id
            AND p.name = NEW.product_name_snapshot
       ) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'This record is immutable. Use a reasoned reversal entry.';
END
$function$;

CREATE OR REPLACE FUNCTION track_private.snapshot_sale_item_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  resolved_name text;
BEGIN
  SELECT p.name INTO resolved_name
    FROM public.products p
    JOIN public.sales s ON s.id = NEW.sale_id
                        AND s.organization_id = p.organization_id
   WHERE p.id = NEW.product_id;
  IF resolved_name IS NULL OR resolved_name = '' THEN
    RAISE EXCEPTION 'Cannot snapshot sale item name: product is missing or belongs to a different organization';
  END IF;
  NEW.product_name_snapshot := resolved_name;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS snapshot_sale_item_name ON public.sale_items;
CREATE TRIGGER snapshot_sale_item_name
BEFORE INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION track_private.snapshot_sale_item_name();

UPDATE public.sale_items si
   SET product_name_snapshot = p.name
  FROM public.sales s, public.products p
 WHERE s.id = si.sale_id
   AND p.id = si.product_id
   AND p.organization_id = s.organization_id
   AND p.name IS NOT NULL
   AND p.name <> ''
   AND si.product_name_snapshot IS NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
