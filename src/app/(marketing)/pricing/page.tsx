
import { TranslatedText } from '@/i18n/text';
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  FALLBACK_PLANS,
  type Plan,
} from "@/components/subscriptions/plan-card";
import { getActiveSubscriptionPlans } from "@/lib/subscriptions/get-plans";
import { PricingClient } from "./pricing-client";
import { Reveal } from "@/components/marketing/reveal";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Transparent monthly plans for Nigerian retailers. Choose the paid TracKasuwa plan that fits your shop.",
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
 * The catalog remains database-managed. The public view excludes the
 * legacy Free row and presents only paid plans, including custom-priced
 * Enterprise.
 */
async function getActivePlans(): Promise<Plan[]> {
  const supabase = await createClient();
  const plans = await getActiveSubscriptionPlans(supabase);
  return (plans ?? FALLBACK_PLANS).filter(
    (plan) => plan.name !== "Free" && (plan.price > 0 || plan.name === "Enterprise"),
  );
}

export default async function PricingPage() {
  const plans = await getActivePlans();

  return (
    <div>
      <section style={{ padding: "100px 0 40px", textAlign: "center" }}>
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <div className="tt-eyebrow mb-3"><TranslatedText text={"Pricing"} /></div>
          </Reveal>
          <Reveal delay={100}>
            <h1
              className="tt-head"
              style={{
                fontSize: "clamp(36px, 6vw, 64px)",
                margin: "0 0 20px",
                lineHeight: 1.05,
              }}
            ><TranslatedText text={"Pay in Naira. Grow when you grow."} /></h1>
          </Reveal>
          <Reveal delay={200}>
            <p
              style={{
                fontSize: 18,
                color: "var(--c-textMuted)",
                maxWidth: 620,
                margin: "0 auto",
              }}
            ><TranslatedText text={"Choose a monthly plan that fits your shop and team."} /></p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: "20px 0 60px" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <PricingClient plans={plans} />

          <p
            className="text-center text-xs mx-auto mt-10 max-w-2xl"
            style={{ color: "var(--c-textMuted)" }}
          ><TranslatedText text={"All listed plans are paid monthly in Nigerian Naira (₦). Enterprise pricing is custom — talk to sales. Offline-first access and automatic data sync are included."} /></p>
        </div>
      </section>
    </div>
  );
}
