import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_PLANS, type Plan } from "@/components/subscriptions/plan-card";
import { getActiveSubscriptionPlans } from "@/lib/subscriptions/get-plans";
import { PricingClient } from "./pricing-client";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for TradeTrack — Free, Starter, Growth, Business, and Enterprise plans. No card required to start.",
};

// Always fetch live from the DB — pricing must reflect a plan change
// made in the dashboard immediately, without a redeploy.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public pricing page — resolves to /pricing. Renders fully logged-out
 * (Server Component using the anon-key server client; RLS policy
 * "plans_select_all" on subscription_plans already permits anyone to
 * SELECT rows where is_active = true — see migration 002/008).
 *
 * Reuses the exact same <PlanCard> used by the authenticated
 * Subscriptions page's "Plans" tab so pricing/feature copy never
 * drifts between the two surfaces. The only difference here is the
 * CTA: instead of an in-place upgrade mutation (which requires an
 * authenticated organization), each card links to
 * /signup?plan={planId} via PlanCard's `selectHref` prop.
 *
 * The actual query lives in `getActiveSubscriptionPlans()`
 * (src/lib/subscriptions/get-plans.ts) — the SAME function the
 * dashboard's Plans tab calls for non-platform_owner roles — so this
 * page cannot silently drift out of sync with the dashboard.
 *
 * IMPORTANT (Step 4 re-skin note): this page's *visual* treatment was
 * rebuilt against the design handoff's Pricing mockup
 * (design_files/marketing.jsx's `Pricing` component), but that
 * mockup's hardcoded `PLANS` array (Free/₦0, Starter/₦3,500,
 * Growth/₦7,500, Business/₦18,000, Enterprise) is FICTIONAL — it does
 * not match this app's real 5-tier catalog (migration 010: Free/₦0,
 * Starter/₦5,000, Growth/₦15,000 [popular], Business/₦30,000,
 * Enterprise/custom) and was deliberately NOT ported, to preserve the
 * pricing-governance single-source-of-truth requirement: the platform
 * owner edits the catalog in one place (Subscriptions ▸ Plans tab) and
 * this page must always reflect exactly that DB state — never a
 * separate hardcoded number.
 */
async function getActivePlans(): Promise<Plan[]> {
  const supabase = await createClient();
  const plans = await getActiveSubscriptionPlans(supabase);
  return plans ?? FALLBACK_PLANS;
}

export default async function PricingPage() {
  const plans = await getActivePlans();

  return (
    <div>
      <section style={{ padding: "100px 0 40px", textAlign: "center" }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <div className="tt-eyebrow mb-3">Pricing</div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="tt-head" style={{ fontSize: "clamp(36px, 6vw, 64px)", margin: "0 0 20px", lineHeight: 1.05 }}>
              Pay in Naira. Grow when you grow.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p style={{ fontSize: 18, color: "var(--c-textMuted)", maxWidth: 620, margin: "0 auto" }}>
              Start free. Upgrade only when you need more cashiers, products, or
              warehouses. No hidden fees.
            </p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: "20px 0 60px" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <PricingClient plans={plans} />

          <p
            className="text-center text-xs mx-auto mt-10 max-w-2xl"
            style={{ color: "var(--c-textMuted)" }}
          >
            All plans include offline-first functionality, multi-device
            support, and automatic data sync. Prices are billed monthly in
            Nigerian Naira (₦). Enterprise pricing is custom — talk to
            sales.
          </p>
        </div>
      </section>
    </div>
  );
}
