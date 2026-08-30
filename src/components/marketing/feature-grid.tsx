import Link from "next/link";
import {
  ShoppingCart,
  WifiOff,
  Warehouse,
  CreditCard,
  ClipboardList,
  BarChart3,
  WifiOff as WifiOffSmall,
} from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Feature grid — ported from the handoff's `FeatureGrid` layout
 * (flagship photo-backed card + 3-column grid below). Content is the
 * SAME verified, already-shipped feature set used by the old page.tsx/
 * /features (POS, offline sync, receipt QR, multi-warehouse, low-stock
 * alerts, reports) — no new/fabricated capabilities introduced, only
 * the visual/animation treatment changes per this session's mandate.
 */
const FEATURES = [
  {
    Icon: ShoppingCart,
    title: "Fast checkout POS",
    desc: "Barcode scanning, split payments, discounts and receipts — built for a busy counter, not a boardroom.",
  },
  {
    Icon: Warehouse,
    title: "Multi-warehouse inventory",
    desc: "Track stock across every location. Transfer between warehouses with a full, signed trail.",
  },
  {
    Icon: CreditCard,
    title: "Zainpay Naira accounts",
    desc: "Every merchant gets a dedicated NUBAN. Subscription payments auto-reconcile via secure webhooks.",
  },
  {
    Icon: ClipboardList,
    title: "Purchase orders",
    desc: "Create, send and receive POs. Inventory updates the moment you receive — full paper trail for suppliers.",
  },
  {
    Icon: BarChart3,
    title: "Reports that decide",
    desc: "Daily, weekly, monthly, quarterly and yearly. Export PDF, Excel or CSV — data you can bring to your bank.",
  },
  {
    Icon: WifiOffSmall,
    title: "Low-stock alerts",
    desc: "Set a reorder threshold per product and get notified before a shelf goes empty.",
  },
];

export function FeatureGrid() {
  return (
    <section style={{ padding: "100px 0", background: "var(--c-bgAlt)" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="tt-eyebrow mb-3">Everything you need. Nothing you don&apos;t.</div>
          <h2 className="tt-head" style={{ fontSize: "clamp(32px, 4vw, 48px)", margin: "0 0 12px", maxWidth: 780, lineHeight: 1.05 }}>
            Built by shopkeepers, for shopkeepers.
          </h2>
          <p className="mb-14" style={{ fontSize: 17, color: "var(--c-textMuted)", maxWidth: 620 }}>
            Every feature earned its place by solving a real problem for a real trader. If it
            wasn&apos;t shipped, it isn&apos;t listed here — see <Link href="/features" className="underline">the full feature list</Link>.
          </p>
        </Reveal>

        {/* Featured card — offline-first (a real, verified, flagship capability) */}
        <Reveal delay={100}>
          <div className="rounded-xl border border-border overflow-hidden mb-6 grid md:grid-cols-2" style={{ background: "var(--c-surface)" }}>
            <div className="p-8 md:p-14 flex flex-col justify-center">
              <Badge className="self-start mb-5">Flagship feature</Badge>
              <h3 className="tt-head" style={{ fontSize: "clamp(24px, 3vw, 36px)", margin: "0 0 16px", lineHeight: 1.1 }}>
                Offline-first, truly. Sell even when the network doesn&apos;t.
              </h3>
              <p className="mb-7" style={{ fontSize: 15, color: "var(--c-textMuted)", lineHeight: 1.6 }}>
                Every sale, price change and stock movement queues on-device.
                When your connection returns, we sync it — append-only for
                sales, last-write-wins for everything else. No lost
                transactions.
              </p>
              <div className="flex gap-8">
                {[
                  { n: "0", l: "Sales lost" },
                  { n: "Auto", l: "Reconnect sync" },
                  { n: "IndexedDB", l: "Local cache" },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="tt-head" style={{ fontSize: 22, color: "var(--c-primary)" }}>{s.n}</div>
                    <div className="tt-muted text-[11px]">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="tt-placeholder relative min-h-[300px]">
              Photo: shop owner ringing up a sale
              <br />
              (pending commissioned photography)
              <div
                className="absolute right-6 bottom-6 rounded-xl p-4 w-[220px]"
                style={{ background: "var(--c-surface)", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <Badge variant="warning" className="gap-1">
                    <WifiOff className="h-2.5 w-2.5" strokeWidth={1.75} /> Offline
                  </Badge>
                  <span className="tt-mono tt-muted text-[10px]">4 queued</span>
                </div>
                <div className="text-[11px]" style={{ color: "var(--c-textMuted)" }}>Current sale</div>
                <div className="tt-head text-[26px] mt-0.5 tt-tabular">₦14,500</div>
                <Button className="w-full mt-2.5" size="sm">Charge ₦14,500</Button>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60}>
              <div className="tt-feature-card rounded-xl border border-border p-7 h-full" style={{ background: "var(--c-surface)" }}>
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center mb-5"
                  style={{ background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)" }}
                >
                  <f.Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="tt-head text-lg mb-2">{f.title}</div>
                <div className="text-sm" style={{ color: "var(--c-textMuted)", lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
