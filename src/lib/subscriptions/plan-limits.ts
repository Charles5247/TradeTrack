/**
 * TradeTrack - Subscription Plan Limits & Feature-Gate Enforcement
 *
 * Pure, framework-free helpers backing the 5-tier subscription ladder
 * introduced in migration 010 (Free -> Starter -> Growth -> Business ->
 * Enterprise). Kept dependency-free (no Supabase/React imports) so they
 * can be unit tested directly and reused from both server routes and
 * client components.
 *
 * NOTE ON SCOPE (updated — see PENDING_FEATURES below):
 * `purchase_orders` now has a real, minimal product surface (see
 * `src/app/(dashboard)/purchase-orders/page.tsx`, gated via
 * `hasFeature(plan, 'purchase_orders')`) and is therefore a normal,
 * live Business-tier feature — it is NOT in `PENDING_FEATURES`.
 *
 * `barcode_label_printing` and `custom_role_permissions` still have no
 * live UI entry point. `api_access` / `webhooks` (Enterprise-only) are
 * intentionally out of scope for the customer-trust correction this
 * module implements — Enterprise is a "Talk to Sales" custom
 * negotiation, not a self-serve plan a customer can be misled by a
 * checkout page into paying for sight-unseen.
 */

/**
 * Single shared source of truth for subscription feature flags that are
 * catalogued (and priced into a plan) but do NOT yet have a live product
 * surface a customer can actually use.
 *
 * WHY THIS EXISTS: TradeTrack is a financial/accountability app — a
 * customer must never be led to believe they are paying for a feature
 * that isn't actually usable yet. Every UI that renders a plan's feature
 * list (the dashboard "Plans" tab's `PlanCard` and the public `/pricing`
 * page, which both already render through the same shared `PlanCard`
 * component) must consult this list and render an honest "Rolling out
 * soon" treatment for anything in it, instead of presenting it as a
 * normal, immediately-usable checkmark item.
 *
 * HOW TO "SHIP" A FEATURE: once a flag's real product surface is built
 * and gated (see `hasFeature()` usage), remove its string from this
 * array. Every consumer of `PENDING_FEATURES` re-derives its rendering
 * from this single array, so removing the key is the ONLY change
 * needed — no other component should hardcode its own copy of this
 * list or its own "coming soon" logic.
 *
 * `custom_role_permissions` is deliberately NOT listed here — it has no
 * scheduled implementation at all, so instead of implying a timeline it
 * is removed entirely from the displayed Business-tier feature list
 * (see `FALLBACK_PLANS` / `FEATURE_LABELS` in
 * `src/components/subscriptions/plan-card.tsx`). This constant is only
 * for features that ARE actively being built and are expected to ship —
 * not a general-purpose "hide this feature" flag.
 */
export const PENDING_FEATURES: string[] = ["barcode_label_printing"];

/** Whether `feature` is catalogued on a plan but not yet actually
 *  usable in the product — i.e. it should render with a "Rolling out
 *  soon" treatment rather than as a normal live checkmark item. */
export function isPendingFeature(feature: string): boolean {
  return PENDING_FEATURES.includes(feature);
}

/**
 * Feature flags that must be hidden entirely from customer-facing plan
 * benefit lists because they have NO scheduled implementation — unlike
 * `PENDING_FEATURES`, these are not "coming soon", so showing any
 * timeline-implying badge for them would itself be dishonest. The only
 * correct customer-facing treatment is to not display them at all.
 *
 * This is a DISPLAY-ONLY concern. It intentionally does NOT touch:
 *   - the `subscription_plans.features` JSONB column in the database
 *     (migration 010's seeded catalog row still lists
 *     `custom_role_permissions` for Business/Enterprise — left as-is,
 *     since that's backend plan configuration, not customer-facing copy)
 *   - `hasFeature()` / `FEATURE_MIN_TIER` / entitlement enforcement,
 *     which continue to work exactly as before for any internal caller
 *     that checks for this flag.
 * Every UI that renders a plan's feature checklist (PlanCard's
 * `getExclusiveFeatures()`, the Subscriptions page's Overview tab) must
 * filter this list out before rendering — see `filterDisplayFeatures()`.
 */
export const HIDDEN_FEATURES: string[] = ["custom_role_permissions"];

/** Removes any `HIDDEN_FEATURES` entries from `features` for
 *  customer-facing display purposes only. Does not affect entitlement
 *  checks (`hasFeature()`), which read the plan's raw `features` array
 *  directly and are unaffected by this filter. */
export function filterDisplayFeatures(features: string[]): string[] {
  return features.filter((f) => !HIDDEN_FEATURES.includes(f));
}

export interface PlanLike {
  id: string;
  name: string;
  max_cashiers: number;
  max_products: number | null;
  max_warehouses: number | null;
  features: string[];
  is_active?: boolean;
}

export interface SubscriptionLike {
  id: string;
  plan_id: string;
  status: string;
}

/** Sentinel value used in the DB for "unlimited" on a numeric plan limit. */
export const UNLIMITED = -1;

/**
 * Resolves the plan attached to a subscription via its `plan_id` foreign
 * key, regardless of whether that plan is currently active in the
 * catalog.
 *
 * This is the mechanism that keeps EXISTING subscribers on a plan that
 * has since been deactivated (e.g. the legacy "Standard" plan
 * retired by migration 010) working correctly: `subscriptions.plan_id`
 * is a stable FK, so a subscriber's resolved plan/limits do not change
 * just because the catalog was restructured -- only `is_active` flips to
 * `false`, which hides the plan from the self-serve "Plans" tab for NEW
 * subscriptions (enforced separately by the `plans_select_all` RLS
 * policy, which still lets `business_owner` read their own inactive
 * plan's row by id).
 *
 * Deliberately looks the plan up by id against the FULL plans list
 * (active + inactive) rather than filtering to `is_active` plans first --
 * that filter-first approach is the bug this function guards against.
 */
export function resolveSubscriptionPlan<T extends PlanLike>(
  subscription: SubscriptionLike | null | undefined,
  allPlans: T[],
): T | null {
  if (!subscription) return null;
  return allPlans.find((p) => p.id === subscription.plan_id) ?? null;
}

/** Treats `null`/`undefined`/`-1` all as "no limit". */
export function isUnlimitedLimit(limit: number | null | undefined): boolean {
  return limit === null || limit === undefined || limit === UNLIMITED;
}

/**
 * Whether an organization currently at `currentProductCount` products may
 * create one more product under `plan`'s `max_products` limit.
 *
 * Fails OPEN (returns true) when `plan` is unavailable -- a transient
 * failure to load subscription data must never block a merchant from
 * using the app, per TradeTrack's offline-first philosophy.
 */
export function canAddProduct(
  currentProductCount: number,
  plan: PlanLike | null | undefined,
): boolean {
  if (!plan) return true;
  if (isUnlimitedLimit(plan.max_products)) return true;
  return currentProductCount < (plan.max_products as number);
}

/** Whether `plan` includes the given feature flag. */
export function hasFeature(
  plan: PlanLike | null | undefined,
  feature: string,
): boolean {
  if (!plan) return false;
  return plan.features.includes(feature);
}

/** Ordered tier ladder — mirrors `PLAN_TIER_ORDER` in the Plans tab UI. */
export const PLAN_TIER_ORDER = [
  "Free",
  "Starter",
  "Growth",
  "Business",
  "Enterprise",
] as const;

/**
 * Minimum tier name required for each gated feature flag, per the 5-tier
 * ladder introduced in migration 010. Drives "Available on the X plan
 * and above" upgrade-prompt copy.
 */
export const FEATURE_MIN_TIER: Record<string, string> = {
  receipt_printing: "Starter",
  daily_summaries: "Starter",
  advanced_reports: "Growth",
  warehouses: "Growth",
  vendors: "Growth",
  barcode_label_printing: "Growth",
  low_stock_alerts: "Growth",
  purchase_orders: "Business",
  custom_role_permissions: "Business",
  priority_support: "Business",
  api_access: "Enterprise",
  webhooks: "Enterprise",
  dedicated_account_manager: "Enterprise",
};

/** Human-readable labels for feature flags (mirrors the Plans tab's
 *  FEATURE_LABELS so upgrade-prompt copy stays consistent app-wide). */
export const FEATURE_LABELS: Record<string, string> = {
  pos: "Point of Sale",
  inventory: "Inventory Management",
  basic_reports: "Basic Reports",
  receipt_printing: "Receipt Printing",
  daily_summaries: "Daily Sales Summaries",
  advanced_reports: "Advanced Reports",
  warehouses: "Multiple Warehouses",
  vendors: "Vendor Consignment",
  barcode_label_printing: "Barcode Label Printing",
  low_stock_alerts: "Low Stock Alerts",
  purchase_orders: "Purchase Orders",
  custom_role_permissions: "Custom Role Permissions",
  priority_support: "Priority Support",
  api_access: "API Access",
  webhooks: "Webhooks",
  dedicated_account_manager: "Dedicated Account Manager",
};

export function getMinTierForFeature(feature: string): string | null {
  return FEATURE_MIN_TIER[feature] ?? null;
}

/** "Available on the Growth plan and above — Upgrade" style copy used by
 *  both the FeatureGate component and any inline enforcement checks. */
export function upgradePromptMessage(feature: string): string {
  const tier = getMinTierForFeature(feature);
  const label = FEATURE_LABELS[feature] ?? feature;
  if (!tier) return `${label} requires a higher plan — Upgrade to unlock it.`;
  return `${label} is available on the ${tier} plan and above — Upgrade to unlock it.`;
}

/** Copy shown when a FREE-tier (or any capped-tier) org hits its
 *  `max_products` ceiling while trying to create a new product. */
export function productLimitMessage(maxProducts: number): string {
  return `You've reached your plan's limit of ${maxProducts} products — Upgrade to add more.`;
}

/** Copy shown when an org hits its `max_cashiers` (max_users) ceiling. */
export function cashierLimitMessage(maxCashiers: number): string {
  return `You've reached your plan's limit of ${maxCashiers} team member(s) — Upgrade to add more.`;
}

/** Copy shown when an org hits its `max_warehouses` (max_locations) ceiling. */
export function warehouseLimitMessage(maxWarehouses: number): string {
  return `You've reached your plan's limit of ${maxWarehouses} location(s) — Upgrade to add more.`;
}
