"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { AuthCarousel } from "@/components/layout/auth-carousel";

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
 * The right panel's background is an auto-advancing photo carousel
 * (`<AuthCarousel>`) rather than a flat `var(--c-primary)` fill — see
 * auth-carousel.tsx for the photography-sourcing note (real photos are
 * not available this session; each slide uses the same flagged
 * `.tt-placeholder` treatment as every other photo slot in the app).
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
      {/* Carousel fills the whole panel; the eyebrow/heading block and
          the blobs below are layered on top with `relative` + a z-index
          stack so they stay readable over whichever slide is active. */}
      <div className="absolute inset-0">
        <AuthCarousel />
      </div>

      <div
        className="tt-blob-float-1 absolute rounded-full blur-3xl pointer-events-none"
        style={{ top: -60, right: -60, width: 420, height: 420, background: "var(--c-accent)", opacity: 0.25, zIndex: 1 }}
      />

      <div className="relative z-[2]">
        <div
          className="tt-eyebrow"
          style={{
            color: "#fff",
            opacity: 0.75,
            textShadow: "0 1px 8px rgba(0,0,0,0.35)",
          }}
        >
          {panel.eyebrow}
        </div>
        <div
          className="tt-head"
          style={{
            fontSize: 40,
            marginTop: 12,
            maxWidth: 440,
            letterSpacing: "var(--letter-tight)",
            color: "#fff",
            textShadow: "0 2px 16px rgba(0,0,0,0.4)",
          }}
        >
          {panel.heading}
        </div>
      </div>

      {/* Spacer — the carousel itself renders the bottom caption + dot
          nav (see auth-carousel.tsx), so this panel only needs to hold
          the top eyebrow/heading block above. */}
      <div className="relative z-[2]" style={{ height: 1 }} />
    </div>
  );
}
