import { Store, ChefHat, Building2, ShoppingBasket } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * Industries band — ported from the handoff's `IndustriesBand` layout.
 * Content deviation (flagged, not guessed): the handoff shows 6
 * industries with 2 marked `live: true` (Retail, Grocery) and 4 marked
 * "Extension" implying a shipped-but-separate module. In this codebase,
 * the Production & Hospitality Extension (README §5.5 / build-order
 * Step 8) has NOT been built yet — no route group, no schema, no
 * feature gate exists. Representing it as an available "Extension"
 * badge would be a fabricated claim, which conflicts with this app's
 * established honesty standard (see /features' explicit "Coming Soon"
 * treatment for the unbuilt AI Assistant). Retail is marked Available;
 * everything else is explicitly "Coming soon" until Step 8 ships.
 */
const INDUSTRIES = [
  {
    key: "retail",
    label: "Retail & wholesale",
    desc: "Provision stores, textiles, auto parts, electronics.",
    Icon: Store,
    live: true,
  },
  {
    key: "grocery",
    label: "Grocery stores",
    desc: "SKU velocity, low-stock alerts, multi-warehouse tracking.",
    Icon: ShoppingBasket,
    live: true,
  },
  {
    key: "restaurants",
    label: "Restaurants & lounges",
    desc: "Menu, kitchen display, table-side ordering.",
    Icon: ChefHat,
    live: false,
  },
  {
    key: "hotels",
    label: "Hotels & hospitality",
    desc: "Rooms, check-in, folios, restaurant rollup.",
    Icon: Building2,
    live: false,
  },
];

export function IndustriesBand() {
  return (
    <section style={{ padding: "100px 0" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="flex flex-wrap justify-between items-end gap-10 mb-12">
            <div>
              <div className="tt-eyebrow mb-3">Industries · one platform</div>
              <h2 className="tt-head" style={{ fontSize: "clamp(28px, 4vw, 48px)", margin: 0, maxWidth: 640, lineHeight: 1.05 }}>
                Retail today. Restaurants &amp; hotels are on the way.
              </h2>
            </div>
            <p style={{ fontSize: 15, color: "var(--c-textMuted)", maxWidth: 380, lineHeight: 1.6 }}>
              A Production &amp; Hospitality extension is planned on top of
              the core platform — same login, same audit trail. Not
              available yet.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRIES.map((ind, i) => (
            <Reveal key={ind.key} delay={i * 80}>
              <div className="tt-industry-card rounded-xl border border-border overflow-hidden" style={{ background: "var(--c-surface)" }}>
                <div
                  className="tt-placeholder"
                  style={{ aspectRatio: "16 / 10" }}
                >
                  {ind.label} photo
                  <br />
                  (pending photography)
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="tt-head text-lg">{ind.label}</div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <ind.Icon className="h-3.5 w-3.5" style={{ color: "var(--c-primary)" }} strokeWidth={1.75} />
                    {ind.live ? (
                      <Badge variant="success">Available</Badge>
                    ) : (
                      <Badge variant="outline">Coming soon</Badge>
                    )}
                  </div>
                  <div className="tt-muted text-[13px]" style={{ lineHeight: 1.55 }}>{ind.desc}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
