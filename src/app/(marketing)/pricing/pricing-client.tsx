"use client";

import { useState } from "react";
import { PlanCard, type Plan } from "@/components/subscriptions/plan-card";

/**
 * Client-side plan grid for the public Pricing page. Owns only the
 * monthly/yearly toggle UI state — `plans` (plain, serializable data)
 * is fetched server-side in page.tsx and passed in as a prop, so the
 * live-DB fetch itself still happens on the server on every request
 * (see `dynamic = "force-dynamic"` in page.tsx).
 *
 * Note: this must be a client component (not a server component with
 * a render-prop) because passing a function as a prop from a Server
 * Component to a Client Component is not supported by React Server
 * Components — only serializable data may cross that boundary.
 */
export function PricingClient({ plans }: { plans: Plan[] }) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );

  return (
    <div>
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center rounded-lg border bg-muted p-1">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              billingCycle === "monthly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              billingCycle === "yearly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mt-12">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            allPlans={plans}
            billingCycle={billingCycle}
            selectHref={`/signup?plan=${plan.id}`}
            selectLabel={plan.price === 0 ? "Start Free" : "Get Started"}
          />
        ))}
      </div>
    </div>
  );
}
