import { CheckCircle2 } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Accountability band — replaces the handoff's `Testimonials` section.
 *
 * Deviation (flagged, not guessed): the handoff's `TESTIMONIALS` array
 * (design_files/marketing.jsx) contains specific fabricated customer
 * names, quotes, business names, and photos (e.g. "Amaka Onyeka,
 * Onyeka Provision Stores · Aba") attributed to real-sounding people
 * who have no relationship to this actual product. Publishing invented
 * customer testimonials as if real would be a materially misleading
 * marketing claim — a much higher-stakes fabrication than the stats
 * band's numbers, since it attributes speech to specific named
 * individuals. This violates the same honesty standard already
 * enforced elsewhere in this codebase (/features' explicit "Coming
 * Soon" labeling; the old homepage's own comment: "No fabricated
 * capabilities"). Retained the same card-grid + Reveal visual pattern,
 * but replaced the content with the pre-existing, real, verifiable
 * "accountability" pitch this app has always shipped (audit trail,
 * cashier attribution, logged stock adjustments, two-way transfer
 * logging) — carried over from the previous page.tsx's
 * `ACCOUNTABILITY_POINTS`, restyled to match the Retail design system.
 * If/when real customer testimonials with consent are collected, this
 * component is the natural drop-in replacement point.
 */
const ACCOUNTABILITY_POINTS = [
  "Every sale is timestamped and tied to the cashier who made it — no more guessing who sold what.",
  "Stock adjustments require a reason, so shrinkage and errors are visible, not hidden.",
  "Warehouse transfers are logged both ways, so nothing goes missing between locations.",
  "An audit trail records who changed what, and when — for owners who need to know what happened while they weren't looking.",
];

export function AccountabilityBand() {
  return (
    <section style={{ padding: "100px 0", background: "var(--c-bgAlt)" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-14 md:grid-cols-2 items-center">
          <Reveal>
            <div className="tt-eyebrow mb-3">Built for accountability</div>
            <h2 className="tt-head" style={{ fontSize: "clamp(28px, 4vw, 44px)", margin: "0 0 16px", lineHeight: 1.08 }}>
              Know exactly what happened in your shop.
            </h2>
            <p style={{ fontSize: 16, color: "var(--c-textMuted)", lineHeight: 1.6, maxWidth: 480 }}>
              Cash businesses lose money to more than theft — unrecorded
              sales, unexplained stock loss, and &quot;I forgot&quot; add up
              fast. TradeTrack builds accountability into every action, so
              you can trust your numbers.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <ul className="flex flex-col gap-5">
              {ACCOUNTABILITY_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <CheckCircle2
                    className="h-5 w-5 shrink-0 mt-0.5"
                    style={{ color: "var(--c-success)" }}
                    strokeWidth={1.75}
                  />
                  <span className="text-sm" style={{ lineHeight: 1.6 }}>{point}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
