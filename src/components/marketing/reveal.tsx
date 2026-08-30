"use client";

import * as React from "react";
import { useInView } from "@/hooks/use-in-view";

/**
 * Scroll-reveal wrapper — ported 1:1 from the design handoff's
 * `Reveal` component (design_files/marketing.jsx): fades + translates
 * children up into place the first time they scroll into view, then
 * stays revealed (never re-hides on scroll-away). Matches README §4.7/
 * §9.6's exact timing: 700ms, cubic-bezier(0.22,1,0.36,1), configurable
 * per-instance `delay` (ms) for staggered entrances and `y` (px, default
 * 24) for travel distance.
 *
 * Deliberately implemented as inline `style` (not the static `.tt-reveal`
 * CSS class) because delay/y need to vary per call site (e.g. Hero's
 * 100/200/350/500/650ms stagger) — the static class only encodes the
 * duration/easing, matching how globals.css documents `.tt-reveal` as a
 * base for JS-driven opacity/transform toggling.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  as: Tag = "div",
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: seen ? 1 : 0,
        transform: seen ? "translateY(0)" : `translateY(${y}px)`,
        transition: `opacity 700ms cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 700ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}
