import * as React from "react";
import Image from "next/image";

/**
 * TracKasuwa's supplied brand mark from docs/logo.
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
        src="/brand/logos/trackasuwa_mark_color_transparent.png"
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
