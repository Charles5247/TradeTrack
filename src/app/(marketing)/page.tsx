import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { AIAssistantBand } from '@/components/marketing/ai-assistant-band';
import { StatsBand } from "@/components/marketing/stats-band";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { IndustriesBand } from "@/components/marketing/industries-band";
import { AccountabilityBand } from "@/components/marketing/accountability-band";
import { CTABand } from "@/components/marketing/cta-band";
import { SocialProofBand } from "@/components/marketing/social-proof-band";
import { showSocialProof } from "@/content/social-proof";
import { siteImages } from "@/content/images";

export const metadata: Metadata = {
  title: "Offline POS & Inventory Built for Accountability",
  description:
    "Offline-first POS and inventory management built for Nigerian retailers. Record sales, track stock, and keep your business moving, even without internet.",
  openGraph: {
    title: "TracKasuwa | POS & Inventory for Nigerian Retailers",
    description:
      "Offline-first POS and inventory management built for Nigerian retailers. Record sales, track stock, and keep your business moving, even without internet.",
    ...(siteImages.socialPreview.src
      ? { images: [
      {
        url: siteImages.socialPreview.src,
        width: 1200,
        height: 630,
        alt: siteImages.socialPreview.alt,
      },
      ] }
      : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: "TracKasuwa | POS & Inventory for Nigerian Retailers",
    description:
      "Offline-first POS and inventory management built for Nigerian retailers. Record sales, track stock, and keep your business moving, even without internet.",
    ...(siteImages.socialPreview.src
      ? { images: [siteImages.socialPreview.src] }
      : {}),
  },
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
      {showSocialProof ? <SocialProofBand /> : null}
      <StatsBand />
      <FeatureGrid />
      <AIAssistantBand />
      <IndustriesBand />
      <AccountabilityBand />
      <CTABand />
    </>
  );
}
