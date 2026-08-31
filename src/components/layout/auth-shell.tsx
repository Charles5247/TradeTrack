"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

/**
 * Shared split-panel shell for every auth screen (Login / Signup /
 * Forgot password / Change password), ported from the design
 * handoff's `AuthShell` + `AuthPanel` (design_files/auth.jsx).
 *
 * Structural port only — the handoff's brand panel used fabricated,
 * named-individual testimonial quotes and invented sales stats (e.g.
 * "Amaka Onyeka... ₦482,190 Sold today"). Per this codebase's existing
 * honesty policy (see accountability-band.tsx's identical deviation
 * for the marketing testimonials section, and /features' "Coming
 * Soon" labeling), those are replaced here with a single honest,
 * unattributed product statement instead of invented customer proof.
 *
 * Renders nothing on the right panel below the `lg` breakpoint so
 * narrow/mobile viewports get the full-width form instead of a
 * squeezed two-column layout.
 */

type AuthVariant = "login" | "signup" | "forgot" | "change";

const PANEL_CONTENT: Record<AuthVariant, { eyebrow: string; heading: string }> = {
  login: {
    eyebrow: "Nigerian retail, unlocked",
    heading: "Your entire shop. In every pocket. Even offline.",
  },
  signup: {
    eyebrow: "Get started",
    heading: "Set up your shop in minutes — no card required.",
  },
  forgot: {
    eyebrow: "Account recovery",
    heading: "Let's get you back in, safely.",
  },
  change: {
    eyebrow: "Account security",
    heading: "One quick step before you continue.",
  },
};

export function AuthShell({
  children,
  variant = "login",
}: {
  children: React.ReactNode;
  variant?: AuthVariant;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: "var(--c-bg)" }}>
      <div className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="TradeTrack home">
            <Logo size={30} />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" strokeWidth={1.75} />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" strokeWidth={1.75} />
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <p className="tt-muted text-center text-xs">
          © {new Date().getFullYear()} TradeTrack Nigeria · Powered by CAXiE Technologies Ltd
        </p>
      </div>

      <AuthBrandPanel variant={variant} />
    </div>
  );
}

function AuthBrandPanel({ variant }: { variant: AuthVariant }) {
  const panel = PANEL_CONTENT[variant];
  return (
    <div
      className="relative hidden lg:flex flex-col justify-between overflow-hidden p-14"
      style={{ background: "var(--c-primary)", color: "var(--c-primaryFg)" }}
    >
      <div
        className="tt-blob-float-1 absolute rounded-full blur-3xl pointer-events-none"
        style={{ top: -60, right: -60, width: 420, height: 420, background: "var(--c-accent)", opacity: 0.35 }}
      />
      <div
        className="tt-blob-float-2 absolute rounded-full blur-3xl pointer-events-none"
        style={{ bottom: -80, left: -60, width: 360, height: 360, background: "var(--c-primaryFg)", opacity: 0.06 }}
      />

      <div className="relative">
        <div
          className="tt-eyebrow"
          style={{ color: "color-mix(in oklch, var(--c-primaryFg), transparent 30%)" }}
        >
          {panel.eyebrow}
        </div>
        <div className="tt-head" style={{ fontSize: 40, marginTop: 12, maxWidth: 440, letterSpacing: "var(--letter-tight)" }}>
          {panel.heading}
        </div>
      </div>

      <div className="relative text-sm" style={{ opacity: 0.85, maxWidth: 400, lineHeight: 1.6 }}>
        Offline-first POS &amp; inventory built for Nigerian retail — sell, track
        stock, and manage multiple locations, even without a connection.
      </div>
    </div>
  );
}
