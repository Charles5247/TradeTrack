"use client";

import Image from "next/image";
import { useCopy } from "@/i18n/text";
import type { SiteImage as SiteImageData } from "@/content/images";

export function SiteImage({
  image,
  sizes,
  className = "object-cover",
  preload = false,
}: {
  image: SiteImageData | undefined;
  sizes: string;
  className?: string;
  preload?: boolean;
}) {
  const copy = useCopy();

  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-primary/20 via-[var(--c-surfaceAlt)] to-[var(--c-accent)]/20"
      />
      {image?.src ? (
        <Image
          src={image.src}
          alt={copy(image.alt)}
          fill
          sizes={sizes}
          className={className}
          preload={preload}
        />
      ) : null}
    </>
  );
}
