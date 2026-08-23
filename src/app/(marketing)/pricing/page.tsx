import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_PLANS, type Plan } from "@/components/subscriptions/plan-card";
import { PricingClient } from "./pricing-client";

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
 * SELECT rows where is_active = true — see migration 002).
 *
 * Reuses the exact same <PlanCard> used by the authenticated
 * Subscriptions page's "Plans" tab so pricing/feature copy never
 * drifts between the two surfaces. The only difference here is the
 * CTA: instead of an in-place upgrade mutation (which requires an
 * authenticated organization), each card links to
 * /signup?plan={planId} via PlanCard's `selectHref` prop.
 */
async function getActivePlans(): Promise<Plan[]> {
  try {
    const supabase = await createClient();
    if (!supabase) return FALLBACK_PLANS;

    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price", { ascending: true });

    if (error || !data || data.length === 0) {
      return FALLBACK_PLANS;
    }

    return data as unknown as Plan[];
  } catch {
    return FALLBACK_PLANS;
  }
}

export default async function PricingPage() {
  const plans = await getActivePlans();

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-bold">Simple, transparent pricing</h1>
        <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          Start free. Upgrade only when you need more cashiers, products,
          or warehouses. No hidden fees.
        </p>
      </div>

      <PricingClient plans={plans} />

      <p className="text-center text-xs text-muted-foreground mt-10 max-w-2xl mx-auto">
        All plans include offline-first functionality, multi-device
        support, and automatic data sync. Prices are billed monthly in
        Nigerian Naira (₦). Enterprise pricing is custom — talk to sales.
      </p>
    </div>
  );
}
