"use client";
import { TranslatedText, useCopy } from '@/i18n/text';


import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowRight, Moon, Sun, Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { useScrollY } from "@/hooks/use-scroll-y";
import { LanguageSelect } from '@/components/shared/language-select';

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/industries", label: "Industries" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact us" },
  { href: "/reviews", label: "Reviews" },
  { href: "/download", label: "Download app" },
];

/**
 * Public marketing nav — ported from the design handoff's
 * `MarketingNav` (design_files/marketing.jsx): sticky, transparent at
 * the top of the page, gains a blurred/bordered background once
 * `scrollY > 20` (300ms transition). Replaces the old plain
 * `bg-background/80 backdrop-blur` header in layout.tsx.
 */
export function MarketingNav() {
  const copy = useCopy();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const scrollY = useScrollY();
  const scrolled = scrollY > 20;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300"
      style={{
        background: scrolled
          ? "color-mix(in oklch, var(--c-bg), transparent 15%)"
          : "var(--c-bg)",
        backdropFilter: scrolled ? "blur(20px)" : "none",
        borderBottom: scrolled
          ? "1px solid var(--c-border)"
          : "1px solid var(--c-border)",
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:px-6 xl:h-[72px] xl:gap-3">
        <Link className="mr-auto shrink-0 xl:mr-2" href="/" aria-label={copy("TracKasuwa home")}>
          <Logo size={30} />
        </Link>

        <div className="shrink-0 sm:hidden">
          <LanguageSelect compact />
        </div>

        <div className="hidden xl:flex flex-1 items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm transition-colors hover:text-[var(--c-text)]"
                style={{
                  color: active ? "var(--c-text)" : "var(--c-textMuted)",
                  fontWeight: active ? 600 : 500,
                }}
              >
                <TranslatedText text={item.label} />
              </Link>
            );
          })}
        </div>
        <div className="hidden xl:block"><LanguageSelect /></div>

        <Button
          variant="ghost"
          size="icon"
          className="hidden xl:inline-flex"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={copy("Toggle theme")}
        >
          <Sun
            className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
            strokeWidth={1.75}
          />
          <Moon
            className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
            strokeWidth={1.75}
          />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          asChild
        >
          <Link href="/login"><TranslatedText text={"Sign in"} /></Link>
        </Button>
        <Button size="sm" className="hidden sm:inline-flex" asChild>
          <Link href="/signup"><TranslatedText text={"Start free"} />{" "}<ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Link>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 xl:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={copy("Toggle menu")}
          aria-expanded={mobileOpen}
          aria-controls="marketing-mobile-menu"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          )}
        </Button>
      </div>

      {mobileOpen && (
        <div id="marketing-mobile-menu" className="max-h-[calc(100dvh-64px)] overflow-y-auto xl:hidden border-t border-border bg-[var(--c-bg)] px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-3 mb-2">
            <div className="hidden sm:block"><LanguageSelect /></div>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={copy("Toggle theme")} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><Sun className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--c-textMuted)] hover:text-[var(--c-text)] hover:bg-[var(--c-surfaceAlt)]"
              >
                <TranslatedText text={item.label} />
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--c-textMuted)] hover:text-[var(--c-text)] hover:bg-[var(--c-surfaceAlt)]"
            ><TranslatedText text={"Sign in"} /></Link>
            <Link
              href="/signup"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--c-primary)] hover:bg-[var(--c-surfaceAlt)]"
            ><TranslatedText text={"Start free"} />{" "}<ArrowRight className="inline h-3.5 w-3.5" strokeWidth={1.75} /></Link>
          </div>
        </div>
      )}
    </nav>
  );
}
