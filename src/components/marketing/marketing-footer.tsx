import Link from "next/link";
import { Logo } from "@/components/layout/logo";

/**
 * Public marketing footer — ported from the design handoff's `Footer`
 * (design_files/marketing.jsx): 4-column layout (brand blurb + Product/
 * Merchants/Legal link columns), copyright line with the flag emoji
 * exception (per the no-emoji-except-footer rule, 🇳🇬 appears ONLY here).
 * Links to routes that don't exist yet in this codebase (e.g. /industries,
 * Changelog, Help center, Privacy/Terms/Security/Refunds legal pages)
 * are intentionally rendered as plain non-interactive text rather than
 * dead <Link>s, to avoid promising pages that 404 — flagged here as a
 * deliberate deviation, not an oversight.
 */
const FOOTER_COLUMNS: {
  title: string;
  links: { label: string; href?: string }[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Download", href: "/download" },
    ],
  },
  {
    title: "Merchants",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Sign up", href: "/signup" },
      { label: "Contact sales" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy" },
      { label: "Terms" },
      { label: "Security" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border" style={{ padding: "60px 0 32px" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4 mb-12">
          <div>
            <Logo size={30} />
            <p
              className="mt-4 max-w-[320px] text-[13px] leading-[1.6]"
              style={{ color: "var(--c-textMuted)" }}
            >
              Offline-first POS &amp; inventory management for Nigerian
              market traders. Made in Nigeria, deployed everywhere.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="tt-eyebrow mb-3">{col.title}</div>
              <div className="flex flex-col gap-2">
                {col.links.map((link) =>
                  link.href ? (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-[13px] hover:text-[var(--c-text)]"
                      style={{ color: "var(--c-textMuted)" }}
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <span
                      key={link.label}
                      className="text-[13px]"
                      style={{ color: "var(--c-textFaint)" }}
                    >
                      {link.label}
                    </span>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <div className="text-xs" style={{ color: "var(--c-textFaint)" }}>
            © {new Date().getFullYear()} TradeTrack Nigeria Ltd | Powered by
            CAXiE Technologies Ltd
          </div>
          <div className="text-xs" style={{ color: "var(--c-textFaint)" }}>
            Made in Nigeria 🇳🇬
          </div>
        </div>
      </div>
    </footer>
  );
}
