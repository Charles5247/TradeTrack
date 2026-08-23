"use client";

/**
 * Shared subscription plan card + supporting constants/helpers.
 *
 * Extracted from src/app/(dashboard)/subscriptions/page.tsx (where it
 * was originally a private, non-exported component) so it can be
 * reused, unchanged, by the public marketing Pricing page
 * (src/app/(marketing)/pricing/page.tsx) without duplicating JSX or
 * drifting out of sync between the authenticated "Plans" tab and the
 * logged-out public pricing page. Both call sites must render
 * identical cards for identical plan data.
 *
 * This module intentionally has NO Supabase/auth/mutation logic of its
 * own — it is presentational only. Callers own data-fetching and pass
 * plans + a `billingCycle` + an `onSelect` handler.
 */

import React from "react";
import {
  CheckCircle,
  Zap,
  Shield,
  Star,
  Sparkles,
  TrendingUp,
  Building2,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { useI18n } from "@/i18n";

// ── Types ─────────────────────────────────────────────────────
export interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billing_cycle: string;
  max_cashiers: number;
  max_products: number | null;
  max_warehouses: number | null;
  features: string[];
  is_active: boolean;
  is_popular?: boolean;
}

// ── Fallback plans if DB unavailable ────────────────────────
// Mirrors migration 010's 5-tier ladder (Free → Starter → Growth
// [Most Popular] → Business → Enterprise). Kept in sync manually since
// this is only a client-side fallback for when the DB is unreachable.
export const FALLBACK_PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    currency: "NGN",
    billing_cycle: "monthly",
    max_cashiers: 1,
    max_products: 50,
    max_warehouses: 1,
    features: ["pos", "inventory", "basic_reports"],
    is_active: true,
  },
  {
    id: "starter",
    name: "Starter",
    price: 5000,
    currency: "NGN",
    billing_cycle: "monthly",
    max_cashiers: 2,
    max_products: 300,
    max_warehouses: 1,
    features: [
      "pos",
      "inventory",
      "basic_reports",
      "receipt_printing",
      "daily_summaries",
    ],
    is_active: true,
  },
  {
    id: "growth",
    name: "Growth",
    price: 15000,
    currency: "NGN",
    billing_cycle: "monthly",
    max_cashiers: 5,
    max_products: 1500,
    max_warehouses: 3,
    features: [
      "pos",
      "inventory",
      "basic_reports",
      "receipt_printing",
      "daily_summaries",
      "advanced_reports",
      "warehouses",
      "vendors",
      "barcode_label_printing",
      "low_stock_alerts",
    ],
    is_active: true,
    is_popular: true,
  },
  {
    id: "business",
    name: "Business",
    price: 30000,
    currency: "NGN",
    billing_cycle: "monthly",
    max_cashiers: 12,
    max_products: 5000,
    max_warehouses: 8,
    features: [
      "pos",
      "inventory",
      "basic_reports",
      "receipt_printing",
      "daily_summaries",
      "advanced_reports",
      "warehouses",
      "vendors",
      "barcode_label_printing",
      "low_stock_alerts",
      "purchase_orders",
      "custom_role_permissions",
      "priority_support",
    ],
    is_active: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 0,
    currency: "NGN",
    billing_cycle: "monthly",
    max_cashiers: -1,
    max_products: -1,
    max_warehouses: -1,
    features: [
      "pos",
      "inventory",
      "basic_reports",
      "receipt_printing",
      "daily_summaries",
      "advanced_reports",
      "warehouses",
      "vendors",
      "barcode_label_printing",
      "low_stock_alerts",
      "purchase_orders",
      "custom_role_permissions",
      "priority_support",
      "api_access",
      "webhooks",
      "dedicated_account_manager",
    ],
    is_active: true,
  },
];

/** Machine feature-flag id → human-readable label. */
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

/** Ordered tier ladder used to compute "everything in the previous
 *  tier is implied" — each card only lists features NOT already present
 *  in the tier immediately before it. */
export const PLAN_TIER_ORDER = [
  "Free",
  "Starter",
  "Growth",
  "Business",
  "Enterprise",
];

/** One-line "Best for ..." description per tier, matching Sortly's
 *  pattern of a short positioning line under the plan name. */
export const PLAN_TAGLINES: Record<string, string> = {
  Free: "Best for getting started",
  Starter: "Best for a single shop finding its rhythm",
  Growth: "Best for multi-cashier shops that need real oversight",
  Business: "Best for growing operations with multiple staff roles",
  Enterprise: "Best for custom multi-branch operations",
};

/** Icon per tier (kept as TradeTrack's existing accent color via the
 *  card's className, not per-icon color, matching the pre-existing
 *  design system rather than introducing new brand colors). */
export const PLAN_ICONS: Record<string, typeof Zap> = {
  Free: Sparkles,
  Starter: Zap,
  Growth: TrendingUp,
  Business: Building2,
  Enterprise: Shield,
};

/** Returns only the features in `plan` that are NOT already present in
 *  the previous tier's feature list — i.e. what's newly unlocked at this
 *  tier — so the UI can render "+ Feature" checklists without repeating
 *  earlier tiers' inclusions. Falls back to the full feature list for
 *  tiers with no known predecessor (e.g. custom/legacy plan names) so
 *  nothing is silently hidden. */
export function getExclusiveFeatures(plan: Plan, allPlans: Plan[]): string[] {
  const tierIndex = PLAN_TIER_ORDER.indexOf(plan.name);
  if (tierIndex <= 0) return plan.features;

  const previousTierName = PLAN_TIER_ORDER[tierIndex - 1];
  const previousPlan = allPlans.find(
    (p) => p.name === previousTierName && p.billing_cycle === plan.billing_cycle,
  );
  if (!previousPlan) return plan.features;

  const previousFeatureSet = new Set(previousPlan.features);
  return plan.features.filter((f) => !previousFeatureSet.has(f));
}

/** Annual price + savings for a monthly-priced plan, using an exact
 *  20%-off-annual formula (monthly × 12 × 0.8). Matches migration 010's
 *  documented numbers exactly (e.g. Starter ₦5,000 → ₦48,000/yr, save
 *  ₦12,000). Enterprise (custom quote) and Free (₦0) plans return zeros;
 *  callers should not render a savings line for those. */
export function computeYearlyPricing(monthlyPrice: number): {
  yearlyPrice: number;
  yearlySavings: number;
} {
  if (!monthlyPrice) return { yearlyPrice: 0, yearlySavings: 0 };
  const fullYearPrice = monthlyPrice * 12;
  const yearlyPrice = Math.round(fullYearPrice * 0.8);
  return { yearlyPrice, yearlySavings: fullYearPrice - yearlyPrice };
}

/** Enterprise is priced as "custom quote" — no self-serve checkout, so
 *  its price/CTA rendering differs from every other card (mailto link
 *  instead of triggering Zainpay / signup). Identified by name since
 *  the id is DB-generated and may differ per environment. */
export function isEnterprisePlan(plan: Plan): boolean {
  return plan.name === "Enterprise";
}

export const SALES_CONTACT_EMAIL = "sales@tradetrack.ng";

// ── PlanCard ──────────────────────────────────────────────────
export function PlanCard({
  plan,
  allPlans,
  currentPlanId,
  billingCycle,
  onSelect,
  isLoading,
  selectLabel,
  selectHref,
}: {
  plan: Plan;
  allPlans: Plan[];
  currentPlanId?: string;
  billingCycle: "monthly" | "yearly";
  /** Called when the CTA button is clicked (authenticated "Plans" tab
   *  usage — upgrades in place). Mutually exclusive with `selectHref`. */
  onSelect?: (planId: string) => void;
  isLoading?: boolean;
  /** Overrides the default "Select Plan" button label (e.g. "Start Free"
   *  or "Get Started" on the public pricing page). */
  selectLabel?: string;
  /** If provided, the CTA renders as a link (e.g. `/signup?plan=...`)
   *  instead of a button calling `onSelect` — used by the logged-out
   *  public Pricing page, which has no mutation to trigger. */
  selectHref?: string;
}) {
  const { t } = useI18n();
  const isCurrent = plan.id === currentPlanId;
  const isEnterprise = isEnterprisePlan(plan);
  const Icon = PLAN_ICONS[plan.name] ?? Zap;
  const tagline = PLAN_TAGLINES[plan.name];
  const exclusiveFeatures = getExclusiveFeatures(plan, allPlans);

  const { yearlyPrice, yearlySavings } = computeYearlyPricing(plan.price);
  const showAsYearly =
    billingCycle === "yearly" && plan.price > 0 && !isEnterprise;
  const displayedPrice = showAsYearly ? yearlyPrice : plan.price;
  const priceSuffix = showAsYearly ? "/yr" : "/mo";

  return (
    <Card
      className={`relative flex flex-col transition-all ${
        plan.is_popular
          ? "border-primary shadow-lg ring-2 ring-primary md:scale-[1.03] z-10"
          : isCurrent
            ? "border-green-500 ring-1 ring-green-500"
            : ""
      }`}
    >
      {plan.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground px-3 shadow-sm">
            <Star className="h-3 w-3 mr-1 fill-current" />
            {t.subscriptions.most_popular}
          </Badge>
        </div>
      )}
      {isCurrent && !plan.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="success" className="px-3">
            {t.subscriptions.current_plan_badge}
          </Badge>
        </div>
      )}

      <CardHeader className="pb-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              plan.is_popular
                ? "bg-primary/10"
                : isCurrent
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-muted"
            }`}
          >
            <Icon
              className={`h-4 w-4 ${
                plan.is_popular
                  ? "text-primary"
                  : isCurrent
                    ? "text-green-600"
                    : "text-muted-foreground"
              }`}
            />
          </div>
          <CardTitle className="text-lg">{plan.name}</CardTitle>
        </div>

        {tagline && (
          <CardDescription className="text-xs">{tagline}</CardDescription>
        )}

        <div className="mt-3">
          {isEnterprise ? (
            <span className="text-2xl font-bold">
              {t.subscriptions.talk_to_sales}
            </span>
          ) : (
            <>
              <span className="text-3xl font-bold">
                {formatCurrency(displayedPrice)}
              </span>
              <span className="text-muted-foreground text-sm">
                {priceSuffix}
              </span>
            </>
          )}
        </div>

        {/* Savings line for annual billing */}
        {showAsYearly && yearlySavings > 0 && (
          <p className="text-xs text-green-600 dark:text-green-500 font-medium mt-1">
            {t.subscriptions.yearly_savings_line
              .replace("{savings}", formatCurrency(yearlySavings))
              .replace("{yearly}", formatCurrency(yearlyPrice))}
          </p>
        )}

        <CardDescription className="mt-2">
          {plan.max_cashiers === -1
            ? t.subscriptions.unlimited
            : plan.max_cashiers}{" "}
          {t.subscriptions.cashiers_count} ·{" "}
          {plan.max_products && plan.max_products > 0
            ? t.subscriptions.products_count.replace(
                "{count}",
                plan.max_products.toLocaleString(),
              )
            : t.subscriptions.unlimited_products}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 flex flex-col flex-1">
        <ul className="space-y-2 flex-1">
          {exclusiveFeatures.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              <span>
                <span className="text-muted-foreground mr-1">+</span>
                {FEATURE_LABELS[feature] ?? feature}
              </span>
            </li>
          ))}
        </ul>

        {isEnterprise ? (
          <Button className="w-full mt-4" variant="outline" asChild>
            <a
              href={`mailto:${SALES_CONTACT_EMAIL}?subject=${encodeURIComponent(
                "TradeTrack Enterprise Plan Inquiry",
              )}`}
            >
              <Mail className="h-4 w-4 mr-2" />
              {t.subscriptions.talk_to_sales}
            </a>
          </Button>
        ) : selectHref ? (
          <Button
            className="w-full mt-4"
            variant={plan.is_popular ? "default" : "outline"}
            asChild
          >
            <a href={selectHref}>{selectLabel ?? t.subscriptions.select_plan}</a>
          </Button>
        ) : (
          <Button
            className="w-full mt-4"
            variant={
              isCurrent ? "outline" : plan.is_popular ? "default" : "outline"
            }
            disabled={isCurrent || isLoading}
            onClick={() => onSelect?.(plan.id)}
          >
            {isCurrent
              ? t.subscriptions.current_plan_badge
              : (selectLabel ?? t.subscriptions.select_plan)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
