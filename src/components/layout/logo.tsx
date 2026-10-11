import * as React from "react";
import Image from "next/image";

/**
 * TracKasuwa "Retail" logomark — bold TT monogram with an accent dot.
 * Ported from the handoff's `logo.jsx` → `LogoRetail` (README §11 Logo).
 * All colors reference the Retail token set (--c-primary/--c-primaryFg/
 * --c-accent/--c-text) so it automatically adapts across light/dark.
 */
export function Logo({
  size = 32,
  showLabel = true,
  className,
}: {
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Image
        src="/brand/trackasuwa-icon.png"
        alt=""
        width={size}
        height={size}
        className="shrink-0"
      />
      {showLabel && (
        <span
          className="tt-head shrink-0"
          style={{ fontSize: size * 0.5, color: "var(--c-text)" }}
        >
          TracKasuwa
        </span>
      )}
    </div>
  );
}
