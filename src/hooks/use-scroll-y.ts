"use client";

import { useEffect, useRef, useState } from "react";

/**
 * rAF-throttled window scrollY tracker — ported from the design handoff's
 * `useScrollY()` (design_files/marketing.jsx). Used by the marketing nav
 * (sticky blur-on-scroll threshold) and the Hero's parallax photo.
 */
export function useScrollY(): number {
  const [y, setY] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => setY(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return y;
}
