import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Bottom CTA band — ported from the handoff's `CTABand` (primary-colored
 * card with blobs + centered CTA copy/buttons).
 */
export function CTABand() {
  return (
    <section style={{ padding: "100px 0" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-xl text-center"
            style={{
              padding: "80px 32px",
              background: "var(--c-primary)",
              color: "var(--c-primaryFg)",
            }}
          >
            <div
              className="tt-blob-float-1 absolute rounded-full blur-3xl pointer-events-none"
              style={{ top: -80, right: -80, width: 400, height: 400, background: "var(--c-accent)", opacity: 0.35 }}
            />
            <div
              className="tt-blob-float-2 absolute rounded-full blur-3xl pointer-events-none"
              style={{ bottom: -80, left: -80, width: 350, height: 350, background: "var(--c-primaryFg)", opacity: 0.05 }}
            />
            <h2 className="tt-head relative" style={{ fontSize: "clamp(32px, 5vw, 56px)", margin: "0 0 16px", lineHeight: 1.05 }}>
              Start selling smarter today.
            </h2>
            <p className="relative mx-auto mb-9" style={{ fontSize: 18, opacity: 0.85, maxWidth: 560 }}>
              Free forever for one shop. Upgrade when your business does. No
              card required to start.
            </p>
            <div className="relative flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-lg h-[52px] px-6 text-base font-medium"
                style={{ background: "var(--c-primaryFg)", color: "var(--c-primary)" }}
              >
                Create your merchant account <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg h-[52px] px-6 text-base font-medium border"
                style={{ borderColor: "color-mix(in oklch, var(--c-primaryFg), transparent 70%)", color: "var(--c-primaryFg)" }}
              >
                See pricing
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
