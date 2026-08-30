"use client";

import { useEffect, useRef, useState } from "react";

/**
 * IntersectionObserver-backed scroll-reveal detector — ported 1:1 from
 * the design handoff's `useInView()` (design_files/marketing.jsx):
 *  - if the element is already inside (or within 200px of) the viewport
 *    at mount, reveal immediately (no flash-then-fade on page load for
 *    above-the-fold content);
 *  - otherwise observe with rootMargin "0px 0px 200px 0px" so elements
 *    reveal slightly before they scroll fully into view;
 *  - a 1200ms safety-fallback timer reveals regardless, so content never
 *    stays invisible if IntersectionObserver support is flaky.
 *
 * Used by <Reveal> (see reveal.tsx) to drive the `.tt-reveal`/`tt-in`
 * scroll-reveal animation contract (README §4.7/§9.6 — 700ms fade +
 * 24px translateY, cubic-bezier(0.22,1,0.36,1)).
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.05,
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const inViewport =
      rect.top < window.innerHeight + 200 && rect.bottom > -200;
    if (inViewport) {
      setSeen(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          obs.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px 200px 0px" },
    );
    obs.observe(ref.current);
    const fallback = setTimeout(() => setSeen(true), 1200);
    return () => {
      obs.disconnect();
      clearTimeout(fallback);
    };
  }, [threshold]);

  return [ref, seen];
}
