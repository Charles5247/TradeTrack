import Link from "next/link";
import { TrendingUp } from "lucide-react";

/**
 * Public marketing route group layout — no auth check, no dashboard
 * chrome. Wraps every page under src/app/(marketing)/ (Home, Pricing,
 * Features, Download) with a shared, lightweight nav bar + footer so a
 * logged-out visitor gets a consistent site shell.
 *
 * Middleware (src/lib/supabase/middleware.ts) explicitly allows every
 * route rendered by this layout to pass through without a session —
 * see PUBLIC_MARKETING_ROUTES there.
 */
const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/download", label: "Download" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <TrendingUp className="h-5 w-5 text-primary-foreground" />
            </span>
            TradeTrack
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden sm:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              Start Free
            </Link>
          </div>
        </div>

        {/* Mobile nav row */}
        <div className="md:hidden border-t">
          <nav className="mx-auto flex max-w-6xl items-center justify-center gap-6 px-4 py-2 text-sm font-medium">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-bold mb-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
                <TrendingUp className="h-4 w-4 text-primary-foreground" />
              </span>
              TradeTrack
            </div>
            <p className="text-sm text-muted-foreground">
              Offline-first POS &amp; inventory management built for
              Nigerian market traders.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/features" className="hover:text-foreground">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-foreground">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/download" className="hover:text-foreground">
                  Download the App
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Account</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/signup" className="hover:text-foreground">
                  Start Free
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-foreground">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a
                  href="mailto:sales@tradetrack.ng"
                  className="hover:text-foreground"
                >
                  sales@tradetrack.ng
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t">
          <p className="mx-auto max-w-6xl px-4 sm:px-6 py-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} TradeTrack | Powered by CAXiE
            Technologies Ltd
          </p>
        </div>
      </footer>
    </div>
  );
}
