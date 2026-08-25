-- ============================================================
-- TradeTrack — Migration 012: Fix stray/legacy subscription_plans
-- rows left incorrectly active after migration 010
-- ============================================================
--
-- BUG THIS FIXES:
--
-- Migration 010's "belt-and-braces" defensive deactivation UPDATE
-- (`WHERE name IN ('Basic', 'Standard') AND id NOT IN (<new 5-tier ids>)`)
-- was meant to catch ANY legacy-named row from ANY source — not just
-- migration 003's 3 hardcoded-UUID rows — but its name list omitted
-- `'Business'`. As a result, any environment where a *second*,
-- independent legacy seed of "Basic"/"Standard"/"Business" rows exists
-- (e.g. `supabase/seed/001_seed_data.sql`, which inserts its own
-- non-canonical demo-data "Basic" ₦5,000 / "Standard" ₦10,000 /
-- "Business" ₦20,000 rows with entirely different UUIDs than migration
-- 003) ends up with:
--   - "Basic" and "Standard" correctly caught and deactivated by the
--     name-based fallback, but
--   - "Business" ₦20,000 left `is_active = true`, because the fallback
--     never checked for that name.
--
-- This is exactly what produced the reported bug: the public /pricing
-- page's `is_active = true`-filtered query returned 6 rows instead of
-- 5 (Free, Starter, Growth, the stray legacy "Business" ₦20,000, the
-- correct "Business" ₦30,000, Enterprise), and the dashboard's
-- (previously unfiltered) Plans tab query additionally surfaced the
-- fully-legacy Basic/Standard rows by name.
--
-- This migration does NOT edit migration 010 in place (already applied
-- in live environments) — instead it adds the missing coverage as a new,
-- idempotent, defensive UPDATE, and also fixes the root query-side bug
-- (dashboard fetching without an is_active filter) in application code
-- — see src/lib/subscriptions/get-plans.ts.
--
-- Per the standing rule from migration 010: never DELETE legacy rows —
-- only deactivate — so any `subscriptions.plan_id` foreign key pointing
-- at one of these old rows keeps resolving correctly.
-- ============================================================

-- Deactivate ANY row named 'Basic', 'Standard', or 'Business' that is
-- NOT one of the current canonical 5-tier catalog ids. This closes the
-- gap left by migration 010 (which omitted 'Business' from its
-- name-based fallback) and catches legacy rows regardless of which
-- seed/migration originally inserted them (migration 003's hardcoded
-- UUIDs, or supabase/seed/001_seed_data.sql's independent demo UUIDs,
-- or any other historical source).
UPDATE subscription_plans
SET is_active = false,
    is_popular = false
WHERE name IN ('Basic', 'Standard', 'Business')
  AND id NOT IN (
    'b1000000-0000-0000-0000-000000000001'::UUID, -- Free
    'b2000000-0000-0000-0000-000000000002'::UUID, -- Starter
    'b3000000-0000-0000-0000-000000000003'::UUID, -- Growth
    'b4000000-0000-0000-0000-000000000004'::UUID, -- Business (current)
    'b5000000-0000-0000-0000-000000000005'::UUID  -- Enterprise
  );

-- ============================================================
-- Verification query (run manually, not part of the migration):
--
--   -- Must return EXACTLY 5 rows after this migration runs:
--   SELECT id, name, price, is_active, is_popular
--   FROM subscription_plans
--   WHERE is_active = true
--   ORDER BY price;
--
--   -- Expect: Free (0), Enterprise (0), Starter (5000), Growth (15000,
--   -- is_popular), Business (30000) — no duplicate names, no legacy
--   -- Basic/Standard/second-Business rows.
-- ============================================================
