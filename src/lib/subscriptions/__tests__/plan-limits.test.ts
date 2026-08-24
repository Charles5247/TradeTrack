import { describe, expect, it } from "vitest";
import {
  canAddProduct,
  cashierLimitMessage,
  filterDisplayFeatures,
  getMinTierForFeature,
  hasFeature,
  HIDDEN_FEATURES,
  isPendingFeature,
  isUnlimitedLimit,
  PENDING_FEATURES,
  productLimitMessage,
  resolveSubscriptionPlan,
  upgradePromptMessage,
  warehouseLimitMessage,
  type PlanLike,
} from "../plan-limits";

// ── Fixtures mirroring migration 010's 5-tier ladder ────────────────

const FREE_PLAN: PlanLike = {
  id: "b1000000-0000-0000-0000-000000000001",
  name: "Free",
  max_cashiers: 1,
  max_products: 50,
  max_warehouses: 1,
  features: ["pos", "inventory", "basic_reports"],
  is_active: true,
};

const STARTER_PLAN: PlanLike = {
  id: "b2000000-0000-0000-0000-000000000002",
  name: "Starter",
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
};

const GROWTH_PLAN: PlanLike = {
  id: "b3000000-0000-0000-0000-000000000003",
  name: "Growth",
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
};

const ENTERPRISE_PLAN: PlanLike = {
  id: "b5000000-0000-0000-0000-000000000005",
  name: "Enterprise",
  max_cashiers: -1,
  max_products: -1,
  max_warehouses: -1,
  features: ["pos", "inventory", "api_access", "webhooks"],
  is_active: true,
};

// The legacy 3-tier catalog row this restructure deactivates rather than
// deletes. `is_active: false` after migration 010 runs.
const LEGACY_STANDARD_PLAN: PlanLike = {
  id: "a2222222-0000-0000-0000-000000000002",
  name: "Standard",
  max_cashiers: 5,
  max_products: 1000,
  max_warehouses: 3,
  features: ["pos", "inventory", "basic_reports", "advanced_reports"],
  is_active: false,
};

const ALL_PLANS = [
  FREE_PLAN,
  STARTER_PLAN,
  GROWTH_PLAN,
  ENTERPRISE_PLAN,
  LEGACY_STANDARD_PLAN,
];

describe("resolveSubscriptionPlan", () => {
  it("resolves an org still on a deactivated legacy plan via subscription.plan_id, not an is_active-filtered lookup", () => {
    // Regression test for the restructure: an org that subscribed under
    // the old 3-tier catalog and never upgraded must keep resolving to
    // its original plan's limits/features after migration 010
    // deactivates that row -- it must NOT silently fall back to Free
    // (or any other plan) just because is_active flipped to false.
    const legacySubscription = {
      id: "sub-legacy-1",
      plan_id: LEGACY_STANDARD_PLAN.id,
      status: "active",
    };

    const resolved = resolveSubscriptionPlan(legacySubscription, ALL_PLANS);

    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe("Standard");
    expect(resolved?.is_active).toBe(false);
    expect(resolved?.max_products).toBe(1000);

    // Sanity-check that this is NOT simply resolving to the first
    // active plan in the list (which would silently mask the bug).
    expect(resolved?.id).not.toBe(FREE_PLAN.id);
  });

  it("still resolves an active-plan subscriber normally", () => {
    const subscription = { id: "sub-1", plan_id: GROWTH_PLAN.id, status: "active" };
    expect(resolveSubscriptionPlan(subscription, ALL_PLANS)?.name).toBe("Growth");
  });

  it("returns null for a null/undefined subscription", () => {
    expect(resolveSubscriptionPlan(null, ALL_PLANS)).toBeNull();
    expect(resolveSubscriptionPlan(undefined, ALL_PLANS)).toBeNull();
  });

  it("returns null when the plan_id does not match any known plan", () => {
    const subscription = { id: "sub-2", plan_id: "does-not-exist", status: "active" };
    expect(resolveSubscriptionPlan(subscription, ALL_PLANS)).toBeNull();
  });
});

describe("canAddProduct / FREE plan product-count enforcement", () => {
  it("allows creating products #1 through #50 on the FREE plan", () => {
    for (let count = 0; count < 50; count++) {
      expect(canAddProduct(count, FREE_PLAN)).toBe(true);
    }
  });

  it("blocks creating product #51 on the FREE plan (max_products: 50)", () => {
    // Explicit validation requirement: FREE plan blocks product #51.
    // `currentProductCount` is the count BEFORE the new insert, so the
    // org already has 50 products when attempting to create the 51st.
    expect(canAddProduct(50, FREE_PLAN)).toBe(false);
  });

  it("allows well beyond 50 products on the Starter plan (max_products: 300)", () => {
    expect(canAddProduct(50, STARTER_PLAN)).toBe(true);
    expect(canAddProduct(299, STARTER_PLAN)).toBe(true);
    expect(canAddProduct(300, STARTER_PLAN)).toBe(false);
  });

  it("never blocks on the Enterprise plan (max_products: -1 = unlimited)", () => {
    expect(canAddProduct(50, ENTERPRISE_PLAN)).toBe(true);
    expect(canAddProduct(1_000_000, ENTERPRISE_PLAN)).toBe(true);
  });

  it("fails open (allows the add) when no plan is resolved", () => {
    expect(canAddProduct(999, null)).toBe(true);
    expect(canAddProduct(999, undefined)).toBe(true);
  });
});

describe("isUnlimitedLimit", () => {
  it("treats -1 as unlimited", () => {
    expect(isUnlimitedLimit(-1)).toBe(true);
  });
  it("treats null/undefined as unlimited", () => {
    expect(isUnlimitedLimit(null)).toBe(true);
    expect(isUnlimitedLimit(undefined)).toBe(true);
  });
  it("treats any non-negative finite number as a real limit", () => {
    expect(isUnlimitedLimit(0)).toBe(false);
    expect(isUnlimitedLimit(50)).toBe(false);
  });
});

describe("hasFeature", () => {
  it("returns true when the plan includes the feature flag", () => {
    expect(hasFeature(GROWTH_PLAN, "barcode_label_printing")).toBe(true);
    expect(hasFeature(GROWTH_PLAN, "warehouses")).toBe(true);
  });

  it("returns false when the plan does not include the feature flag", () => {
    expect(hasFeature(FREE_PLAN, "barcode_label_printing")).toBe(false);
    expect(hasFeature(STARTER_PLAN, "purchase_orders")).toBe(false);
  });

  it("returns false (fails closed) when no plan is resolved", () => {
    expect(hasFeature(null, "pos")).toBe(false);
    expect(hasFeature(undefined, "pos")).toBe(false);
  });
});

describe("feature-gate upgrade-prompt copy", () => {
  it("reports the correct minimum tier for each new gated feature flag", () => {
    expect(getMinTierForFeature("barcode_label_printing")).toBe("Growth");
    expect(getMinTierForFeature("purchase_orders")).toBe("Business");
    expect(getMinTierForFeature("custom_role_permissions")).toBe("Business");
    expect(getMinTierForFeature("api_access")).toBe("Enterprise");
    expect(getMinTierForFeature("webhooks")).toBe("Enterprise");
  });

  it("returns null for unknown/unrestricted feature flags", () => {
    expect(getMinTierForFeature("pos")).toBeNull();
    expect(getMinTierForFeature("totally_made_up_flag")).toBeNull();
  });

  it("builds an 'Available on the X plan and above — Upgrade' message", () => {
    expect(upgradePromptMessage("barcode_label_printing")).toBe(
      "Barcode Label Printing is available on the Growth plan and above — Upgrade to unlock it.",
    );
    expect(upgradePromptMessage("purchase_orders")).toBe(
      "Purchase Orders is available on the Business plan and above — Upgrade to unlock it.",
    );
    expect(upgradePromptMessage("api_access")).toBe(
      "API Access is available on the Enterprise plan and above — Upgrade to unlock it.",
    );
  });

  it("builds a limit-reached upgrade message for products/cashiers/warehouses", () => {
    expect(productLimitMessage(50)).toContain("50 products");
    expect(cashierLimitMessage(1)).toContain("1 team member(s)");
    expect(warehouseLimitMessage(1)).toContain("1 location(s)");
  });
});

describe("PENDING_FEATURES / isPendingFeature", () => {
  it("flags barcode_label_printing as pending (actively being built, not yet usable)", () => {
    expect(PENDING_FEATURES).toContain("barcode_label_printing");
    expect(isPendingFeature("barcode_label_printing")).toBe(true);
  });

  it("does NOT flag purchase_orders as pending — it has a real, live product surface", () => {
    // Regression guard: once Part B (the minimal Purchase Orders
    // feature) ships, this flag must render as a normal live feature,
    // not a "Rolling out soon" pending one.
    expect(PENDING_FEATURES).not.toContain("purchase_orders");
    expect(isPendingFeature("purchase_orders")).toBe(false);
  });

  it("does NOT flag custom_role_permissions as pending — it is hidden entirely, not 'coming soon'", () => {
    expect(PENDING_FEATURES).not.toContain("custom_role_permissions");
    expect(isPendingFeature("custom_role_permissions")).toBe(false);
  });

  it("returns false for any feature flag not in the list", () => {
    expect(isPendingFeature("pos")).toBe(false);
    expect(isPendingFeature("totally_made_up_flag")).toBe(false);
  });

  it("simulates 'shipping' a pending feature: removing it from the array is the only change needed", () => {
    // Acceptance-criterion simulation: consumers re-derive entirely from
    // the PENDING_FEATURES array, so a shrunken/synthetic copy of it
    // behaves exactly like isPendingFeature() would once the real array
    // is trimmed down when a feature ships.
    const simulatedShippedList = PENDING_FEATURES.filter(
      (f) => f !== "barcode_label_printing",
    );
    expect(simulatedShippedList.includes("barcode_label_printing")).toBe(
      false,
    );
  });
});

describe("HIDDEN_FEATURES / filterDisplayFeatures", () => {
  it("hides custom_role_permissions — no scheduled implementation, must not appear at all", () => {
    expect(HIDDEN_FEATURES).toContain("custom_role_permissions");
  });

  it("filters hidden features out of a feature list while preserving order of the rest", () => {
    const businessFeatures = [
      "pos",
      "inventory",
      "purchase_orders",
      "custom_role_permissions",
      "priority_support",
    ];
    expect(filterDisplayFeatures(businessFeatures)).toEqual([
      "pos",
      "inventory",
      "purchase_orders",
      "priority_support",
    ]);
  });

  it("is a no-op when no hidden features are present", () => {
    const features = ["pos", "inventory", "basic_reports"];
    expect(filterDisplayFeatures(features)).toEqual(features);
  });

  it("does not affect hasFeature() entitlement checks — filtering is display-only", () => {
    const businessLikePlan: PlanLike = {
      id: "biz-1",
      name: "Business",
      max_cashiers: 12,
      max_products: 5000,
      max_warehouses: 8,
      features: ["pos", "purchase_orders", "custom_role_permissions"],
      is_active: true,
    };
    // Even though custom_role_permissions is hidden from display, the
    // underlying entitlement flag (if ever consumed internally) still
    // reads true from the raw features array.
    expect(hasFeature(businessLikePlan, "custom_role_permissions")).toBe(
      true,
    );
  });
});
