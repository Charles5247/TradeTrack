"use client";

import * as React from "react";
import { Store, ShoppingCart, Warehouse, Receipt } from "lucide-react";

/**
 * Auto-advancing photo carousel for the right-hand brand panel of every
 * auth screen (Login / Signup / Forgot password / Change password),
 * replacing the previous solid-`var(--c-primary)` background per the
 * user's explicit request for "a background carousel or photo on the
 * right side of the auth pages (already having a solid blue colored
 * background)".
 *
 * Photography sourcing note (same constraint as hero.tsx /
 * feature-grid.tsx / industries-band.tsx): real commissioned photography
 * is not available this session — AI image generation failed
 * (insufficient credits) and image_search only returned commercially
 * licensed stock photography (Alamy/Dreamstime/DepositPhotos), which
 * this codebase's image-licensing policy explicitly forbids using. Each
 * slide therefore uses the same `.tt-placeholder` flagged-placeholder
 * treatment as every other photo slot in the app, so this carousel is
 * structurally ready to receive real photography (four aspect-ratio-
 * correct slide slots, real caption copy, real auto-advance + dot
 * navigation) the moment it's available, without any component changes.
 *
 * Captions describe real, shipped product capabilities only (POS,
 * multi-warehouse inventory, offline sync, receipts) — no fabricated
 * customer quotes or invented statistics, per the honesty policy
 * established in accountability-band.tsx / auth-shell.tsx.
 */

interface Slide {
  key: string;
  Icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  caption: string;
  sub: string;
}

const SLIDES: Slide[] = [
  {
    key: "counter",
    Icon: Store,
    caption: "Photo: shop owner at the counter",
    sub: "Every retail counter, tracked from one dashboard.",
  },
  {
    key: "pos",
    Icon: ShoppingCart,
    caption: "Photo: cashier ringing up a sale",
    sub: "Barcode-scan checkout, even with no signal.",
  },
  {
    key: "warehouse",
    Icon: Warehouse,
    caption: "Photo: stock check across warehouses",
    sub: "Multi-warehouse inventory, always in sync.",
  },
  {
    key: "receipt",
    Icon: Receipt,
    caption: "Photo: printed receipt with QR code",
    sub: "Every sale recorded, every receipt traceable.",
  },
];

const SLIDE_INTERVAL_MS = 5000;

export function AuthCarousel() {
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {SLIDES.map((slide, i) => {
        const Icon = slide.Icon;
        const active = i === index;
        return (
          <div
            key={slide.key}
            aria-hidden={!active}
            className="tt-placeholder absolute inset-0 flex-col gap-3"
            style={{
              display: "flex",
              opacity: active ? 1 : 0,
              transition: "opacity 900ms cubic-bezier(0.22, 1, 0.36, 1)",
              padding: 0,
            }}
          >
            <Icon size={40} strokeWidth={1.5} />
            <div style={{ maxWidth: 220 }}>
              {slide.caption}
              <br />
              (pending commissioned photography)
            </div>
          </div>
        );
      })}

      {/* Gradient overlay so the caption text stays legible over any
          eventual photo, matching hero.tsx's overlay treatment. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, transparent 55%, color-mix(in oklch, var(--c-primary), black 30%) 100%)",
        }}
      />

      {/* Caption + dot navigation, bottom-anchored over the active slide. */}
      <div className="absolute inset-x-0 bottom-0 p-8">
        <p
          className="tt-head text-white"
          style={{ fontSize: 22, lineHeight: 1.3, maxWidth: 360, textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
        >
          {SLIDES[index].sub}
        </p>
        <div className="mt-5 flex items-center gap-2">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              aria-label={`Show slide ${i + 1}: ${slide.sub}`}
              onClick={() => setIndex(i)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === index ? 24 : 8,
                background:
                  i === index
                    ? "#fff"
                    : "rgba(255,255,255,0.4)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
