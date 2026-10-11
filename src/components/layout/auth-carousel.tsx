"use client";

import * as React from "react";
import { useCopy } from '@/i18n/text';

import type { SiteImage as SiteImageData } from "@/content/images";
import { SiteImage } from "@/components/shared/site-image";
import { siteImages } from "@/content/images";

interface Slide {
  key: string;
  image: SiteImageData;
  sub: string;
}

const SLIDES: Slide[] = [
  {
    key: "counter",
    image: siteImages.authCarousel.counter,
    sub: "Every retail counter, tracked from one dashboard.",
  },
  {
    key: "pos",
    image: siteImages.authCarousel.pos,
    sub: "Barcode-scan checkout, even with no signal.",
  },
  {
    key: "warehouse",
    image: siteImages.authCarousel.warehouse,
    sub: "Multi-warehouse inventory, always in sync.",
  },
  {
    key: "receipt",
    image: siteImages.authCarousel.receipt,
    sub: "Every sale recorded, every receipt traceable.",
  },
];

const SLIDE_INTERVAL_MS = 5000;

export function AuthCarousel() {
  const copy = useCopy();
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {SLIDES.map((slide, i) => {

        const active = i === index;
        return (
          <div
            key={slide.key}
            aria-hidden={!active}
            className="absolute inset-0"
            style={{
              display: "flex",
              opacity: active ? 1 : 0,
              transition: "opacity 900ms cubic-bezier(0.22, 1, 0.36, 1)",
              padding: 0,
            }}
          >
            <SiteImage image={slide.image} sizes="50vw" />
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
          {copy(SLIDES[index].sub)}
        </p>
        <div className="mt-5 flex items-center gap-2">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              aria-label={`${i + 1}: ${copy(slide.sub)}`}
              onClick={() => setIndex(i)}
              className="h-11 min-w-11 rounded-full border border-white/30 transition-all"
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
