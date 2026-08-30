import { Reveal } from "@/components/marketing/reveal";

/**
 * Stats band — ported from the handoff's `StatsBand` (animated-counter
 * layout). Deviation (flagged, not guessed): the handoff's literal copy
 * ("12,400+ Merchants onboard", "₦4.2B Processed this year") are
 * fabricated business-scale metrics with no basis in this codebase —
 * inventing them would violate the same "no fabricated claims" standard
 * already enforced on /features (which explicitly marks unbuilt things
 * "Coming Soon" rather than claiming they exist). Replaced with stats
 * that describe real, verifiable product facts instead of invented
 * business metrics.
 */
const STATS = [
  { n: "5", l: "Naira-priced plans, Free to Enterprise" },
  { n: "4", l: "Roles with dedicated permissions" },
  { n: "0", l: "Sales lost when your connection drops" },
  { n: "100%", l: "Actions logged to an audit trail" },
];

export function StatsBand() {
  return (
    <section
      className="border-y border-border"
      style={{ padding: "80px 0" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {STATS.map((s, i) => (
            <Reveal key={s.l} delay={i * 100}>
              <div>
                <div className="tt-head" style={{ fontSize: 48, color: "var(--c-primary)", lineHeight: 1 }}>
                  {s.n}
                </div>
                <div className="tt-muted mt-2 text-sm">{s.l}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
