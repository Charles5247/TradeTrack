import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";

/**
 * Public marketing route group layout — no auth check, no dashboard
 * chrome. Wraps every page under src/app/(marketing)/ (Home, Pricing,
 * Features, Download) with the Retail design system's sticky,
 * scroll-aware nav + footer shell (Step 4/10 of the design handoff's
 * build order — see docs/CHANGELOG.md).
 *
 * Middleware (src/lib/supabase/middleware.ts) explicitly allows every
 * route rendered by this layout to pass through without a session —
 * see PUBLIC_MARKETING_ROUTES there.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="tt-marketing min-h-screen flex flex-col"
      style={{ background: "var(--c-bg)", color: "var(--c-text)" }}
    >
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
