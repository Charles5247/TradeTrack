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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Features",
  description:
    "An honest look at what TradeTrack can do today — POS, offline sync, receipt printing with QR codes, multi-warehouse inventory, low-stock alerts, and reports.",
};

/**
 * Public features page — resolves to /features. Deliberately lists
 * ONLY capabilities that are actually built and verified in this
 * codebase (no fabricated/aspirational claims):
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
    description:
      "A fast checkout screen built for a busy counter, not a boardroom.",
    points: [
      "Search or scan products to build a sale in seconds",
      "Apply discounts and accept cash or other payment methods",
      "Works on a phone, tablet, or desktop browser",
    ],
  },
  {
    icon: WifiOff,
    title: "Offline-First Sync",
    description:
      "Nigerian networks aren't always reliable — TradeTrack doesn't stop working when yours drops.",
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
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
      <div className="text-center mb-12 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold">What TradeTrack actually does</h1>
        <p className="mt-3 text-muted-foreground">
          No exaggerated claims — this page lists exactly what's built and
          working today, and is honest about what isn't finished yet.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_SECTIONS.map((section) => (
          <Card key={section.title} className="border-0 shadow-sm bg-card/60">
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <section.icon className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-lg">{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {section.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

        {/* Coming Soon — explicitly NOT a real feature yet, kept honest */}
        <Card className="border-dashed border-2 bg-muted/30">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-2">
              <Sparkles className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">AI Assistant</CardTitle>
              <Badge variant="outline">Coming Soon</Badge>
            </div>
            <CardDescription>
              We're exploring an AI assistant to help with things like
              restock suggestions and sales insights.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This feature does not exist in the app yet. We'd rather tell
              you that plainly than promise something that isn't built.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="text-center mt-16">
        <h2 className="text-2xl font-bold mb-4">Ready to try it?</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/signup">
              Start Free
              <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">See Pricing</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
