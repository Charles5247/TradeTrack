import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { StatsBand } from "@/components/marketing/stats-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { IndustriesBand } from "@/components/marketing/industries-band";
import { AccountabilityBand } from "@/components/marketing/accountability-band";
import { CTABand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "TradeTrack — POS & Inventory Built for Accountability",
  description:
    "Offline-first point-of-sale and inventory management for Nigerian market traders. Every sale recorded, every stock movement tracked, even without internet.",
};

/**
 * Public marketing homepage — resolves to "/". Rebuilt per Step 4/10 of
 * the Retail design handoff's build order (README §13): full hero +
 * stats + feature-grid + industries + accountability + CTA composition,
 * ported from design_files/marketing.jsx's `Landing` page assembly,
 * with the animation contract (scroll-reveal, blob floats, parallax
 * hero photo, staggered entrance, marquee) driven by the motion-library
 * CSS already added to globals.css in Step 1.
 *
 * Content deviations from the literal handoff mockup are documented
 * per-component (see stats-band.tsx, industries-band.tsx,
 * accountability-band.tsx) — every fabricated number/testimonial/
 * unbuilt-feature claim in the handoff's raw copy was replaced with
 * real, verifiable product facts, preserving this app's existing "no
 * fabricated capabilities" honesty standard (see /features).
 */
export default function MarketingHomePage() {
  return (
    <>
      <Hero />
      <StatsBand />
      <FeatureGrid />
      <IndustriesBand />
      <AccountabilityBand />
      <CTABand />
    </>
  );
}
