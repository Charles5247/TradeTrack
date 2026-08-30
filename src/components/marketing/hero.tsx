"use client";

import Link from "next/link";
import { ArrowRight, Download, Check, ArrowUp } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { LogoMarquee } from "@/components/marketing/logo-marquee";
import { useScrollY } from "@/hooks/use-scroll-y";

/**
 * Hero copy — ported from the design handoff's `HERO_COPY` (4 brand-
 * direction variants: ledger/market/operator/retail). TradeTrack uses
 * the "retail" direction, matching a POS/checkout-first product.
 */
const HERO_COPY = {
  eyebrow: "Point of Sale · Nigeria",
  title: "Sell faster. Restock smarter. Never lose a sale.",
  sub: "Barcode-scan checkout, split payments, offline-ready — plus a dedicated Naira account for every merchant. TradeTrack is retail, unlocked.",
};

const TRUST_LOGOS = [
  "Aliko Stores",
  "Umeh & Sons",
  "Mama Nkechi",
  "Balogun Textiles",
  "Kano Grains",
  "Chuka Auto Parts",
  "Kilimanjaro Kitchen",
  "Nikkoos Bakery",
  "Onyeka Provisions",
  "Lekki Grand Hotel",
];

function MiniBars() {
  const values = [12, 20, 15, 28, 32, 24, 38];
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-[3px] h-10 mt-2">
      {values.map((v, i) => (
        <div
          key={i}
          className="tt-bar-grow flex-1 rounded-sm"
          style={{
            background: `color-mix(in oklch, var(--c-primary), transparent ${75 - v}%)`,
            height: `${(v / max) * 100}%`,
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Hero visual — photo of a trader + floating app-mockup card overlay.
 * Ported from the handoff's `HeroCompositePhoto`. The main photo slot
 * uses `.tt-placeholder` (see docs/CHANGELOG.md's "Photography sourcing"
 * note): AI image generation was unavailable this session (credits
 * exhausted) and image-search results were either commercially
 * licensed or not authentically on-topic, so the photo slot is left as
 * an explicitly-flagged placeholder pending real commissioned
 * photography or a later image-generation pass, per the original
 * Step 10 plan ("leave placeholder photography, flagged with
 * `.tt-placeholder`").
 */
function HeroCompositePhoto() {
  return (
    <div className="relative" style={{ aspectRatio: "1 / 1.05" }}>
      <div
        className="tt-hero-photo tt-placeholder absolute inset-0 rounded-xl overflow-hidden"
        style={{
          boxShadow:
            "0 40px 100px -20px color-mix(in oklch, var(--c-primary), transparent 75%)",
        }}
      >
        Photo: Nigerian shop owner at checkout counter
        <br />
        (pending commissioned photography)
      </div>

      {/* Floating dashboard mockup */}
      <div
        className="tt-hero-mockup absolute left-[-40px] bottom-[-30px] w-[280px] rounded-xl overflow-hidden"
        style={{
          boxShadow:
            "0 30px 60px -15px color-mix(in oklch, var(--c-primary), transparent 70%)",
        }}
      >
        <div
          className="flex items-center gap-1.5 px-3 py-2 border-b"
          style={{ background: "var(--c-surfaceAlt)", borderColor: "var(--c-border)" }}
        >
          <span className="w-[7px] h-[7px] rounded-full" style={{ background: "#ff5f56" }} />
          <span className="w-[7px] h-[7px] rounded-full" style={{ background: "#ffbd2e" }} />
          <span className="w-[7px] h-[7px] rounded-full" style={{ background: "#27c93f" }} />
          <span className="tt-mono ml-1.5 text-[9px]" style={{ color: "var(--c-textMuted)" }}>
            tradetrack.ng
          </span>
        </div>
        <div className="p-3.5" style={{ background: "var(--c-surface)" }}>
          <div className="text-[10px]" style={{ color: "var(--c-textMuted)" }}>
            Today · Lagos HQ
          </div>
          <div className="tt-head text-[26px] mt-0.5 leading-none">
            ₦482,190
          </div>
          <div
            className="flex items-center gap-1 mt-0.5 text-[10px]"
            style={{ color: "var(--c-success)" }}
          >
            <ArrowUp className="h-2.5 w-2.5" strokeWidth={1.75} /> +18% vs yesterday
          </div>
          <MiniBars />
        </div>
      </div>

      {/* Floating live-sale toast */}
      <div
        className="tt-hero-toast absolute right-[-20px] top-10 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
        style={{ background: "var(--c-surface)", boxShadow: "0 20px 40px -10px rgba(0,0,0,0.15)" }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "color-mix(in oklch, var(--c-success), transparent 82%)" }}
        >
          <Check className="h-4 w-4" style={{ color: "var(--c-success)" }} strokeWidth={1.75} />
        </div>
        <div>
          <div className="text-xs font-semibold">Sale complete</div>
          <div className="tt-mono text-[10px]" style={{ color: "var(--c-textMuted)" }}>
            ₦14,500 · Cash · #A00248
          </div>
        </div>
      </div>

      {/* Floating stat pill */}
      <div
        className="tt-hero-pill absolute left-[30px] top-[-20px] flex items-center gap-2 rounded-xl px-3.5 py-2"
        style={{ background: "var(--c-surface)", boxShadow: "0 20px 40px -10px rgba(0,0,0,0.15)" }}
      >
        <span className="tt-dot-pulse w-2 h-2 rounded-full" style={{ background: "var(--c-success)" }} />
        <span className="text-xs font-semibold">147 sales today</span>
      </div>
    </div>
  );
}

export function Hero() {
  const scrollY = useScrollY();
  const py = Math.min(scrollY * 0.15, 60);

  return (
    <section className="relative overflow-hidden" style={{ paddingTop: 60, paddingBottom: 100 }}>
      {/* Animated blobs */}
      <div
        className="tt-blob-float-1 absolute rounded-full blur-3xl pointer-events-none"
        style={{ top: -100, right: -80, width: 500, height: 500, background: "var(--c-primary)", opacity: 0.12 }}
      />
      <div
        className="tt-blob-float-2 absolute rounded-full blur-3xl pointer-events-none"
        style={{ top: 200, left: -80, width: 400, height: 400, background: "var(--c-accent)", opacity: 0.12 }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-16 lg:grid-cols-[1.1fr_1fr] items-center">
          <div>
            <Reveal delay={100}>
              <div
                className="tt-eyebrow inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-5 border"
                style={{ background: "var(--c-surfaceAlt)", borderColor: "var(--c-border)" }}
              >
                <span className="tt-dot-pulse w-1.5 h-1.5 rounded-full" style={{ background: "var(--c-success)" }} />
                {HERO_COPY.eyebrow}
              </div>
            </Reveal>

            <Reveal delay={200}>
              <h1
                className="tt-head"
                style={{ fontSize: "clamp(40px, 6vw, 68px)", margin: "0 0 20px", maxWidth: 640, lineHeight: 1.02 }}
              >
                {HERO_COPY.title}
              </h1>
            </Reveal>

            <Reveal delay={350}>
              <p
                className="mb-8"
                style={{ fontSize: 18, lineHeight: 1.55, color: "var(--c-textMuted)", maxWidth: 540 }}
              >
                {HERO_COPY.sub}
              </p>
            </Reveal>

            <Reveal delay={500}>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-lg h-[52px] px-6 text-base font-medium"
                  style={{ background: "var(--c-primary)", color: "var(--c-primaryFg)" }}
                >
                  Start free — no card <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                </Link>
                <Link
                  href="/download"
                  className="inline-flex items-center gap-2 rounded-lg h-[52px] px-6 text-base font-medium border"
                  style={{ borderColor: "var(--c-border)", color: "var(--c-text)" }}
                >
                  <Download className="h-4 w-4" strokeWidth={1.75} /> Download for Windows
                </Link>
              </div>
            </Reveal>

            <Reveal delay={650}>
              <div className="flex flex-wrap items-center gap-6 mt-8">
                {["Free plan forever", "Offline-ready", "Works on any phone"].map((c) => (
                  <div key={c} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" style={{ color: "var(--c-success)" }} strokeWidth={1.75} />
                    <span className="text-[13px]" style={{ color: "var(--c-textMuted)" }}>{c}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <div style={{ transform: `translateY(${-py * 0.3}px)`, position: "relative" }}>
            <HeroCompositePhoto />
          </div>
        </div>
      </div>

      <Reveal delay={800}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6" style={{ marginTop: 100 }}>
          <div
            className="tt-eyebrow text-center mb-6"
            style={{ color: "var(--c-textFaint)" }}
          >
            Trusted by thousands of traders &amp; merchants across Nigeria
          </div>
          <LogoMarquee items={TRUST_LOGOS} />
        </div>
      </Reveal>
    </section>
  );
}
