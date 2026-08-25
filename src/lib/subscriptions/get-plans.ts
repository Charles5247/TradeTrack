/**
 * TradeTrack — Single Source of Truth for "which subscription_plans rows
 * are the live, sellable catalog"
 * ============================================================
 *
 * WHY THIS EXISTS (bug fix, see docs/CHANGELOG.md):
 *
 * The public marketing pricing page (`/pricing`) and the authenticated
 * dashboard's Subscriptions > Plans tab each had their OWN, independently
 * written Supabase query for `subscription_plans`:
 *
 *   - `/pricing` (src/app/(marketing)/pricing/page.tsx) already filtered
 *     `.eq("is_active", true)` — correct in isolation.
 *   - The dashboard's Plans tab (fetchSubscriptionData() in
 *     src/app/(dashboard)/subscriptions/page.tsx) had NO `is_active`
 *     filter at all — it fetched every row in the table.
 *
 * Two hand-written queries for the same "give me the current plan
 * catalog" concept is exactly the kind of thing that silently drifts:
 * fix one call site and forget the other, or (as investigated) let
 * stray rows (a non-canonical demo seed file's own subscription_plans
 * INSERT, see supabase/seed/001_seed_data.sql) leak into the live
 * catalog because only ONE of the two call sites was filtering it out.
 *
 * This module is the ONE place that knows how to fetch "the active,
 * sellable plan catalog, ordered for display" — both surfaces must call
 * `getActiveSubscriptionPlans()` instead of writing their own query.
 *
 * NOTE ON THE DASHBOARD'S DUAL PURPOSE: the Plans tab is used by BOTH
 * `business_owner` (self-service plan selection — should only ever see
 * active, sellable plans) AND `platform_owner` (global catalog
 * management — add/edit/delete ANY plan, including inactive/legacy
 * ones, so they can be edited back to life or permanently retired).
 * These are genuinely different queries with different intents, so this
 * module exports two functions rather than forcing one shape on both:
 *
 *   - `getActiveSubscriptionPlans()` — the ONLY function the public
 *     pricing page needs, and the one `business_owner` should be shown
 *     in the dashboard.
 *   - `getAllSubscriptionPlansForCatalogManagement()` — explicitly
 *     unfiltered, for `platform_owner`'s catalog-management view only.
 *     Its name is intentionally verbose so nobody mistakes it for the
 *     one public-facing query.
 *
 * Both accept an already-constructed Supabase client so this module
 * stays agnostic to *which* client (server anon-key client in a Server
 * Component vs. browser anon-key client in a Client Component) the
 * caller is using — see src/lib/supabase/server.ts and client.ts.
 */

import type { Plan } from "@/components/subscriptions/plan-card";

/**
 * Loose, structural shape both the server (`@supabase/ssr` server
 * client, typed against the full `Database` generic) and browser
 * (`@supabase/ssr` browser client) Supabase clients satisfy — just
 * enough of the query builder for this module's needs.
 *
 * Deliberately untyped (`any`) at the query-builder level rather than
 * modeling Supabase's exact `PostgrestFilterBuilder` return types:
 * those types are thenable (not strict `Promise`s) and, when the
 * concrete `Database` generic is threaded through from a caller like
 * `subscriptions/page.tsx`, produce a type deep enough to blow up
 * `tsc`'s instantiation limit (TS2589). Every real caller in this repo
 * either already `await`s these calls directly (fully unwrapping the
 * thenable) or constructs its client from `src/lib/supabase/server.ts`
 * / `client.ts`, so runtime behavior is unaffected by loosening the
 * compile-time contract here — this module still fully validates
 * `data`/`error` shape once the query settles, in the functions below.
 */
interface PlansQueryClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: "subscription_plans"): any;
}

/**
 * The ONE query for "the current, live, sellable plan catalog, cheapest
 * first" — used by:
 *   - the public /pricing page (logged-out, anon-key server client)
 *   - the dashboard Subscriptions > Plans tab, for `business_owner`
 *     (self-service plan selection; browser anon-key client)
 *
 * Deliberately mirrors migration 010's own documented verification
 * query (`WHERE is_active = true ORDER BY price`) so this function's
 * output is exactly what that migration's comment asserts should exist.
 *
 * Returns `null` (never throws) on any Supabase error/empty result so
 * every caller can fall back to `FALLBACK_PLANS` exactly like they
 * already did before this extraction — this function does not decide
 * the fallback, callers do (they already import `FALLBACK_PLANS` from
 * plan-card.tsx for their own last-resort UI).
 */
export async function getActiveSubscriptionPlans(
  supabase: PlansQueryClient | null | undefined,
): Promise<Plan[] | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    return data as unknown as Plan[];
  } catch {
    return null;
  }
}

/**
 * Explicitly UNFILTERED catalog fetch — every row regardless of
 * `is_active`, ordered by price. For `platform_owner`'s catalog
 * management view ONLY (add/edit/delete any plan, including legacy or
 * currently-deactivated ones). Never use this for a customer-facing
 * "which plans can I buy" surface — use `getActiveSubscriptionPlans()`
 * for that.
 */
export async function getAllSubscriptionPlansForCatalogManagement(
  supabase: PlansQueryClient | null | undefined,
): Promise<Plan[] | null> {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("price", { ascending: true });

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    return data as unknown as Plan[];
  } catch {
    return null;
  }
}
