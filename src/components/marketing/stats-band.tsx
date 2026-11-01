
import { TranslatedLabel } from '@/i18n/text';
import { Reveal } from "@/components/marketing/reveal";
import { createClient } from '@/lib/supabase/server';

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
type Traction = { businesses?: number; products?: number; transactions?: number; business_names?: string[] };

export async function StatsBand() {
  let traction: Traction = {};
  try {
    const supabase = await createClient();
    if (supabase) {
      const { data } = await supabase.rpc("get_marketing_traction");
      if (data && typeof data === "object" && !Array.isArray(data)) traction = data as Traction;
    }
  } catch {
    traction = {};
  }

  const stats = [
    { n: typeof traction.products === "number" ? traction.products.toLocaleString() : "—", l: "Products tracked" },
    { n: typeof traction.businesses === "number" ? traction.businesses.toLocaleString() : "—", l: "Businesses served" },
    { n: typeof traction.transactions === "number" ? traction.transactions.toLocaleString() : "—", l: "Completed transactions" },
    { n: "30", l: "Days to try your business tools" },
  ];
  const names = Array.isArray(traction.business_names) ? traction.business_names.filter((name): name is string => typeof name === "string" && name.length > 0) : [];

  return (
    <>
    <section className="border-y border-border" style={{ padding: "36px 0" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {stats.map((s, i) => (
            <Reveal key={s.l} delay={i * 100}>
              <div>
                <div className="tt-head" style={{ fontSize: 32, color: "var(--c-primary)", lineHeight: 1 }}>
                  <TranslatedLabel>{s.n}</TranslatedLabel>
                </div>
                <div className="tt-muted mt-2 text-sm"><TranslatedLabel>{s.l}</TranslatedLabel></div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
    {names.length > 0 ? (
      <section className="border-b border-border py-5" aria-label="Businesses using TracKasuwa">
        <div className="mx-auto max-w-6xl overflow-hidden px-4 sm:px-6">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Trusted businesses</p>
          <div className="flex w-max gap-3 tt-marquee" aria-hidden="true">
            {[...names, ...names].map((name, index) => <span key={`${name}-${index}`} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium">{name}</span>)}
          </div>
        </div>
      </section>
    ) : null}
    </>
  );
}
