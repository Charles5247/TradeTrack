/**
 * Infinite horizontal trust-band marquee — ported from the design
 * handoff's `LogoMarquee` (design_files/marketing.jsx). Doubles the
 * item list and animates via the pre-existing `.tt-marquee` keyframe
 * (globals.css, 30s linear infinite, `var(--tt-dur-marquee)`) so the
 * loop is seamless. Edge-faded with a mask-image gradient so items
 * fade in/out at the band's edges instead of clipping abruptly.
 */
export function LogoMarquee({ items }: { items: string[] }) {
  const doubled = [...items, ...items];
  return (
    <div
      className="relative overflow-hidden"
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <div className="tt-marquee inline-flex gap-[60px] whitespace-nowrap">
        {doubled.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="tt-head shrink-0"
            style={{
              fontSize: 16,
              letterSpacing: "0.02em",
              color: "var(--c-textMuted)",
              opacity: 0.7,
            }}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}
