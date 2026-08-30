import * as React from 'react';

/**
 * TradeTrack "Retail" logomark — bold TT monogram with an accent dot.
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
    <div className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="4" y="4" width="32" height="32" rx="9" fill="var(--c-primary)" />
        <path
          d="M10 14 H22 M16 14 V28"
          stroke="var(--c-primaryFg)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M22 14 H30 M26 14 V28"
          stroke="var(--c-primaryFg)"
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.6"
        />
        <circle cx="30" cy="10" r="3" fill="var(--c-accent)" />
      </svg>
      {showLabel && (
        <span
          className="tt-head shrink-0"
          style={{ fontSize: size * 0.5, color: 'var(--c-text)' }}
        >
          TradeTrack
        </span>
      )}
    </div>
  );
}
