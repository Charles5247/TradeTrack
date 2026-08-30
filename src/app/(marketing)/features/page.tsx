import Link from "next/link";
import type { Metadata } from "next";
import {
  ShoppingCart,
  WifiOff,
  QrCode,
  Warehouse,
  AlertTriangle,
  BarChart3,
  Users,
  Truck,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/marketing/reveal";
import { CTABand } from "@/components/marketing/cta-band";

export const metadata: Metadata = {
  title: "Features",
  description:
    "An honest look at what TradeTrack can do today — POS, offline sync, receipt printing with QR codes, multi-warehouse inventory, low-stock alerts, and reports.",
};

/**
 * Public features page — resolves to /features. Deliberately lists
 * ONLY capabilities that are actually built and verified in this
 * codebase (no fabricated/aspirational claims) — unchanged content
 * policy from before this Step 4 re-skin, only the visual/animation
 * treatment (Reveal stagger, Retail card tokens) is new:
 *  - POS:                  src/app/(dashboard)/pos/
 *  - Offline sync:         src/lib/offline/*, sync_queue tables
 *  - Receipt QR:           src/components/receipts/barcode-image.tsx
 *                          (qrcode.react), src/lib/pdf/receipt-pdf.ts
 *  - Multi-warehouse:      src/app/(dashboard)/warehouses/, transfers/
 *  - Low-stock alerts:     notifications + inventory thresholds
 *  - Reports:              src/app/(dashboard)/reports/
 * The "AI Assistant" section below is explicitly marked Coming Soon —
 * it does not exist in the app today.
 */
const FEATURE_SECTIONS = [
  {
    icon: ShoppingCart,
    title: "Point of Sale",
    description: "A fast checkout screen built for a busy counter, not a boardroom.",
    points: [
      "Search or scan products to build a sale in seconds",
      "Apply discounts and accept cash or other payment methods",
      "Works on a phone, tablet, or desktop browser",
    ],
  },
  {
    icon: WifiOff,
    title: "Offline-First Sync",
    description: "Nigerian networks aren't always reliable — TradeTrack doesn't stop working when yours drops.",
    points: [
      "Sales and stock changes are saved locally the instant they happen",
      "A background sync queue pushes everything to the cloud once you're back online",
      "No double-entry, no lost sales when the connection blips",
    ],
  },
  {
    icon: QrCode,
    title: "Receipt Printing with QR Codes",
    description: "Give every customer a proper, verifiable receipt.",
    points: [
      "Generate PDF receipts you can print or share",
      "Each receipt includes a scannable QR code",
      "Works with standard printers — no special hardware required",
    ],
  },
  {
    icon: Warehouse,
    title: "Multi-Warehouse Inventory",
    description: "Run more than one location without losing track of stock.",
    points: [
      "Track quantities per warehouse, not just one global number",
      "Move stock between warehouses with a full transfer record",
      "Number of warehouses allowed scales with your plan",
    ],
  },
  {
    icon: AlertTriangle,
    title: "Low-Stock Alerts",
    description: "Get told before a shelf goes empty, not after.",
    points: [
      "Set a reorder threshold per product",
      "In-app notifications when stock drops below it",
      "Helps prevent lost sales from unnoticed stockouts",
    ],
  },
  {
    icon: BarChart3,
    title: "Reports",
    description: "See what's actually happening in your business.",
    points: [
      "Daily sales summaries",
      "Inventory and stock-movement reports",
      "Advanced reports on higher-tier plans",
    ],
  },
  {
    icon: Truck,
    title: "Vendor Consignment",
    description: "Track goods you sell on behalf of suppliers.",
    points: [
      "Record vendor transactions and payments",
      "Keep consignment stock separate from your own inventory",
    ],
  },
  {
    icon: Users,
    title: "Multiple Cashiers & Roles",
    description: "Give staff the right level of access — no more, no less.",
    points: [
      "Business owner, admin, and cashier roles",
      "Number of cashier seats scales with your plan",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Audit Trail",
    description: "Know who did what, and when.",
    points: [
      "Key actions across the app are logged for accountability",
      "Helps identify the source of stock discrepancies or unusual changes",
    ],
  },
  {
    icon: Smartphone,
    title: "Install as an App",
    description: "Use TradeTrack like a native app, on the devices you already have.",
    points: [
      "Installable as a Progressive Web App on Android and desktop Chromium browsers",
      "Dedicated Windows desktop and Android builds available — see /download",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div>
      <section style={{ padding: "100px 0 40px" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal><div className="tt-eyebrow mb-3">Features</div></Reveal>
          <Reveal delay={100}>
            <h1 className="tt-head" style={{ fontSize: "clamp(32px, 6vw, 64px)", margin: "0 0 20px", maxWidth: 900, lineHeight: 1.05 }}>
              Every capability, honestly documented.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p style={{ fontSize: 18, color: "var(--c-textMuted)", maxWidth: 620 }}>
              We ship this list — not aspirational marketing. What&apos;s not
              built yet is either coming soon, or hidden until it is.
            </p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: "0 0 100px" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_SECTIONS.map((section, i) => (
              <Reveal key={section.title} delay={i * 60} className="h-full">
                <div className="rounded-xl border border-border p-7 h-full" style={{ background: "var(--c-surface)" }}>
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                    style={{ background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)" }}
                  >
                    <section.icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="tt-head text-lg mb-1.5">{section.title}</div>
                  <div className="text-sm mb-4" style={{ color: "var(--c-textMuted)" }}>{section.description}</div>
                  <ul className="space-y-2 text-sm">
                    {section.points.map((point) => (
                      <li key={point} className="flex items-start gap-2">
                        <CheckCircle2
                          className="h-3.5 w-3.5 mt-0.5 shrink-0"
                          style={{ color: "var(--c-success)" }}
                          strokeWidth={1.75}
                        />
                        <span style={{ color: "var(--c-textMuted)" }}>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}

            {/* Coming Soon — explicitly NOT a real feature yet, kept honest */}
            <Reveal delay={FEATURE_SECTIONS.length * 60} className="h-full">
              <div
                className="rounded-xl border-2 border-dashed p-7 h-full"
                style={{ borderColor: "var(--c-border)", background: "var(--c-surfaceAlt)" }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: "var(--c-surfaceAlt)", color: "var(--c-textMuted)" }}
                >
                  <Sparkles className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="tt-head text-lg">AI Assistant</div>
                  <Badge variant="outline">Coming Soon</Badge>
                </div>
                <div className="text-sm mb-4" style={{ color: "var(--c-textMuted)" }}>
                  We&apos;re exploring an AI assistant to help with things
                  like restock suggestions and sales insights.
                </div>
                <p className="text-sm" style={{ color: "var(--c-textMuted)" }}>
                  This feature does not exist in the app yet. We&apos;d
                  rather tell you that plainly than promise something that
                  isn&apos;t built.
                </p>
              </div>
            </Reveal>
          </div>

          <div className="text-center mt-16">
            <h2 className="tt-head text-2xl mb-4">Ready to try it?</h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-lg h-11 px-6 text-sm font-medium"
                style={{ background: "var(--c-primary)", color: "var(--c-primaryFg)" }}
              >
                Start Free <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg h-11 px-6 text-sm font-medium border"
                style={{ borderColor: "var(--c-border)" }}
              >
                See Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <CTABand />
    </div>
  );
}
