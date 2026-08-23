import Link from "next/link";
import type { Metadata } from "next";
import {
  ShoppingCart,
  WifiOff,
  QrCode,
  Warehouse,
  AlertTriangle,
  BarChart3,
  ArrowRight,
  Download,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "TradeTrack — POS & Inventory Built for Accountability",
  description:
    "Offline-first point-of-sale and inventory management for Nigerian market traders. Every sale recorded, every stock movement tracked, even without internet.",
};

/**
 * Public marketing homepage — resolves to "/". Every feature claimed
 * here is a real, already-shipped capability (verified against the
 * codebase): POS, offline-first sync, QR-coded PDF receipts,
 * multi-warehouse transfers, low-stock alerts, and reports. No
 * fabricated capabilities — see /features for the honest full list,
 * including what's explicitly "Coming Soon" (AI Assistant).
 */
const FEATURES = [
  {
    icon: ShoppingCart,
    title: "Point of Sale",
    description:
      "Fast, simple checkout built for busy counters — ring up sales, apply discounts, and take payments in seconds.",
  },
  {
    icon: WifiOff,
    title: "Offline-First Sync",
    description:
      "Keep selling even when the network drops. Every sale and stock change is queued locally and syncs automatically the moment you're back online.",
  },
  {
    icon: QrCode,
    title: "Receipt Printing with QR",
    description:
      "Print or share PDF receipts with a scannable QR code customers can use to verify their purchase.",
  },
  {
    icon: Warehouse,
    title: "Multi-Warehouse",
    description:
      "Track stock across as many locations as your plan allows, and move inventory between them with a full transfer trail.",
  },
  {
    icon: AlertTriangle,
    title: "Low-Stock Alerts",
    description:
      "Get notified before you run out — set reorder thresholds per product and never lose a sale to an empty shelf.",
  },
  {
    icon: BarChart3,
    title: "Reports",
    description:
      "See what's actually selling with sales, inventory, and daily-summary reports you can trust.",
  },
];

const ACCOUNTABILITY_POINTS = [
  "Every sale is timestamped and tied to the cashier who made it — no more guessing who sold what.",
  "Stock adjustments require a reason, so shrinkage and errors are visible, not hidden.",
  "Warehouse transfers are logged both ways, so nothing goes missing between locations.",
  "An audit trail records who changed what, and when — for owners who need to know what happened while they weren't looking.",
];

export default function MarketingHomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl -z-10" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-400/10 rounded-full blur-3xl -z-10" />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-28 text-center">
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground">
            POS &amp; Inventory that keeps{" "}
            <span className="text-primary">everyone accountable</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto">
            TradeTrack records every sale, every stock movement, and every
            change — even when the network is down. Built for market
            traders and shop owners who need to know exactly what's
            happening in their business.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="xl" asChild>
              <Link href="/signup">
                Start Free
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link href="/pricing">See Pricing</Link>
            </Button>
            <Button size="xl" variant="ghost" asChild>
              <Link href="/download">
                <Download className="h-4 w-4 mr-1" />
                Download the App
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature highlights */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Everything a shop actually needs</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            No bloat, no fake AI promises — just the tools real businesses
            use every day.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="border-0 shadow-sm bg-card/60">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link
            href="/features"
            className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
          >
            See the full feature list <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Accountability pitch */}
      <section className="bg-muted/30 border-y">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid gap-10 md:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-4">
                Know exactly what happened in your shop
              </h2>
              <p className="text-muted-foreground">
                Cash businesses lose money to more than theft — unrecorded
                sales, unexplained stock loss, and "I forgot" add up fast.
                TradeTrack builds accountability into every action, so you
                can trust your numbers.
              </p>
            </div>
            <ul className="space-y-4">
              {ACCOUNTABILITY_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="text-sm">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-24 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to see it for yourself?</h2>
        <p className="text-muted-foreground mb-8">
          Get started for free — no card required.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="xl" asChild>
            <Link href="/signup">
              Start Free
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button size="xl" variant="outline" asChild>
            <Link href="/pricing">See Pricing</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
