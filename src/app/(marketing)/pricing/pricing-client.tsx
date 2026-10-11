"use client";

import { PlanCard, type Plan } from "@/components/subscriptions/plan-card";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Client-side plan grid for the public Pricing page. `plans` (plain, serializable data)
 * is fetched server-side in page.tsx and passed in as a prop, so the
 * live-DB fetch itself still happens on the server on every request
 * (see `dynamic = "force-dynamic"` in page.tsx).
 *
 * Re-skinned (Step 4) to use the `<Segmented>` pill control (README
 * §6.x's `.tt-seg`) instead of a plain button pair, and to stagger the
 * <PlanCard> grid in with <Reveal>. The pricing DATA itself is
 * unchanged from before this re-skin — still the exact same
 * `plans`/`PlanCard` props, still no hardcoded numbers.
 *
 * Note: this must be a client component (not a server component with
 * a render-prop) because passing a function as a prop from a Server
 * Component to a Client Component is not supported by React Server
 * Components — only serializable data may cross that boundary.
 */
export function PricingClient({ plans }: { plans: Plan[] }) {
  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {plans.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 80} className="h-full">
            <PlanCard
              plan={plan}
              allPlans={plans}
              billingCycle="monthly"
              selectHref={`/signup?plan=${plan.id}`}
              selectLabel="Get Started"
            />
          </Reveal>
        ))}
      </div>
    </div>
  );
}
