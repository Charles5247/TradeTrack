/* TradeTrack Design Tokens — 4 directions × light/dark × density profiles.
 * Each direction is a complete visual language: color, type, radius, motion,
 * illustration hints. Applied to :root as CSS variables at runtime.
 */

const DIRECTIONS = {
  ledger: {
    name: "Ledger",
    tagline: "Trust-first Nigerian fintech",
    description: "Moniepoint / Kuda DNA. Deep midnight indigo, warm cream neutrals, editorial serif accents. Credible, premium, banking-grade.",
    logo: "diamond",
    fontHead: "'Instrument Serif', 'Times New Roman', serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    fontDisplayWeight: 400,
    letterSpacingTight: "-0.02em",
    radius: 10,
    light: {
      bg: "oklch(0.985 0.008 85)",
      bgAlt: "oklch(0.97 0.012 85)",
      surface: "oklch(1 0 0)",
      surfaceAlt: "oklch(0.975 0.01 85)",
      border: "oklch(0.9 0.012 85)",
      borderStrong: "oklch(0.82 0.015 85)",
      text: "oklch(0.18 0.03 265)",
      textMuted: "oklch(0.5 0.02 265)",
      textFaint: "oklch(0.65 0.015 265)",
      primary: "oklch(0.28 0.14 265)",
      primaryFg: "oklch(0.985 0.008 85)",
      primaryHover: "oklch(0.24 0.15 265)",
      accent: "oklch(0.72 0.16 75)",
      accentFg: "oklch(0.18 0.03 265)",
      success: "oklch(0.55 0.13 155)",
      warn: "oklch(0.72 0.16 75)",
      danger: "oklch(0.58 0.19 25)",
      info: "oklch(0.55 0.12 240)",
      chart1: "oklch(0.28 0.14 265)",
      chart2: "oklch(0.72 0.16 75)",
      chart3: "oklch(0.55 0.13 155)",
      chart4: "oklch(0.58 0.19 25)",
      chart5: "oklch(0.45 0.1 320)",
    },
    dark: {
      bg: "oklch(0.19 0.018 265)",
      bgAlt: "oklch(0.22 0.02 265)",
      surface: "oklch(0.245 0.022 265)",
      surfaceAlt: "oklch(0.275 0.024 265)",
      border: "oklch(0.33 0.02 265)",
      borderStrong: "oklch(0.4 0.022 265)",
      text: "oklch(0.93 0.01 85)",
      textMuted: "oklch(0.72 0.014 265)",
      textFaint: "oklch(0.58 0.014 265)",
      primary: "oklch(0.74 0.11 75)",
      primaryFg: "oklch(0.19 0.018 265)",
      primaryHover: "oklch(0.78 0.11 75)",
      accent: "oklch(0.74 0.11 75)",
      accentFg: "oklch(0.19 0.018 265)",
      success: "oklch(0.7 0.13 155)",
      warn: "oklch(0.75 0.12 75)",
      danger: "oklch(0.68 0.15 25)",
      info: "oklch(0.68 0.11 240)",
      chart1: "oklch(0.74 0.11 75)",
      chart2: "oklch(0.66 0.1 265)",
      chart3: "oklch(0.7 0.13 155)",
      chart4: "oklch(0.68 0.15 25)",
      chart5: "oklch(0.62 0.1 320)",
    },
  },

  market: {
    name: "Market",
    tagline: "Local & tactile — made for traders",
    description: "Nigerian textile & agriculture DNA. Warm terracotta + deep bush green on paper-white. Larger touch targets, subtly hand-crafted, feels like it belongs to a trader.",
    logo: "leaf",
    fontHead: "'Fraunces', 'Georgia', serif",
    fontBody: "'Plus Jakarta Sans', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    fontDisplayWeight: 500,
    letterSpacingTight: "-0.025em",
    radius: 14,
    light: {
      bg: "oklch(0.975 0.014 75)",
      bgAlt: "oklch(0.955 0.02 75)",
      surface: "oklch(0.995 0.006 75)",
      surfaceAlt: "oklch(0.965 0.018 75)",
      border: "oklch(0.88 0.018 60)",
      borderStrong: "oklch(0.78 0.025 60)",
      text: "oklch(0.22 0.04 55)",
      textMuted: "oklch(0.48 0.03 55)",
      textFaint: "oklch(0.62 0.025 55)",
      primary: "oklch(0.42 0.11 155)",
      primaryFg: "oklch(0.98 0.01 75)",
      primaryHover: "oklch(0.36 0.12 155)",
      accent: "oklch(0.62 0.16 40)",
      accentFg: "oklch(0.98 0.01 75)",
      success: "oklch(0.5 0.13 155)",
      warn: "oklch(0.7 0.15 70)",
      danger: "oklch(0.55 0.19 30)",
      info: "oklch(0.5 0.11 235)",
      chart1: "oklch(0.42 0.11 155)",
      chart2: "oklch(0.62 0.16 40)",
      chart3: "oklch(0.7 0.15 70)",
      chart4: "oklch(0.5 0.11 235)",
      chart5: "oklch(0.55 0.19 30)",
    },
    dark: {
      bg: "oklch(0.21 0.018 55)",
      bgAlt: "oklch(0.24 0.02 55)",
      surface: "oklch(0.265 0.022 55)",
      surfaceAlt: "oklch(0.295 0.025 55)",
      border: "oklch(0.36 0.022 55)",
      borderStrong: "oklch(0.43 0.025 55)",
      text: "oklch(0.93 0.012 75)",
      textMuted: "oklch(0.72 0.018 55)",
      textFaint: "oklch(0.58 0.018 55)",
      primary: "oklch(0.68 0.13 40)",
      primaryFg: "oklch(0.21 0.018 55)",
      primaryHover: "oklch(0.72 0.13 40)",
      accent: "oklch(0.68 0.1 155)",
      accentFg: "oklch(0.21 0.018 55)",
      success: "oklch(0.68 0.11 155)",
      warn: "oklch(0.74 0.11 70)",
      danger: "oklch(0.66 0.14 30)",
      info: "oklch(0.66 0.1 235)",
      chart1: "oklch(0.68 0.13 40)",
      chart2: "oklch(0.68 0.1 155)",
      chart3: "oklch(0.74 0.11 70)",
      chart4: "oklch(0.66 0.1 235)",
      chart5: "oklch(0.66 0.14 30)",
    },
  },

  operator: {
    name: "Operator",
    tagline: "Modern SaaS — precise, keyboard-first",
    description: "Linear / Ramp / Notion DNA. Near-black with emerald accent, tight grid, mono for numbers. For the power operator running many merchants.",
    logo: "grid",
    fontHead: "'Geist', 'Inter', system-ui, sans-serif",
    fontBody: "'Geist', 'Inter', system-ui, sans-serif",
    fontMono: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
    fontDisplayWeight: 600,
    letterSpacingTight: "-0.035em",
    radius: 6,
    light: {
      bg: "oklch(0.99 0.002 250)",
      bgAlt: "oklch(0.975 0.003 250)",
      surface: "oklch(1 0 0)",
      surfaceAlt: "oklch(0.98 0.003 250)",
      border: "oklch(0.92 0.005 250)",
      borderStrong: "oklch(0.85 0.008 250)",
      text: "oklch(0.15 0.01 250)",
      textMuted: "oklch(0.5 0.008 250)",
      textFaint: "oklch(0.68 0.006 250)",
      primary: "oklch(0.2 0.02 250)",
      primaryFg: "oklch(0.99 0.002 250)",
      primaryHover: "oklch(0.15 0.02 250)",
      accent: "oklch(0.62 0.16 155)",
      accentFg: "oklch(0.99 0.002 250)",
      success: "oklch(0.62 0.16 155)",
      warn: "oklch(0.72 0.15 75)",
      danger: "oklch(0.6 0.2 25)",
      info: "oklch(0.58 0.14 245)",
      chart1: "oklch(0.2 0.02 250)",
      chart2: "oklch(0.62 0.16 155)",
      chart3: "oklch(0.58 0.14 245)",
      chart4: "oklch(0.72 0.15 75)",
      chart5: "oklch(0.6 0.2 25)",
    },
    dark: {
      bg: "oklch(0.17 0.005 250)",
      bgAlt: "oklch(0.2 0.006 250)",
      surface: "oklch(0.225 0.007 250)",
      surfaceAlt: "oklch(0.255 0.008 250)",
      border: "oklch(0.3 0.008 250)",
      borderStrong: "oklch(0.37 0.008 250)",
      text: "oklch(0.92 0.004 250)",
      textMuted: "oklch(0.7 0.006 250)",
      textFaint: "oklch(0.56 0.008 250)",
      primary: "oklch(0.92 0.004 250)",
      primaryFg: "oklch(0.17 0.005 250)",
      primaryHover: "oklch(0.86 0.006 250)",
      accent: "oklch(0.68 0.13 155)",
      accentFg: "oklch(0.17 0.005 250)",
      success: "oklch(0.68 0.13 155)",
      warn: "oklch(0.74 0.11 75)",
      danger: "oklch(0.66 0.15 25)",
      info: "oklch(0.66 0.11 245)",
      chart1: "oklch(0.68 0.13 155)",
      chart2: "oklch(0.66 0.11 245)",
      chart3: "oklch(0.74 0.11 75)",
      chart4: "oklch(0.66 0.15 25)",
      chart5: "oklch(0.62 0.1 320)",
    },
  },

  retail: {
    name: "Retail",
    tagline: "Bold POS — cashier-friendly",
    description: "Square / Shopify POS DNA. Electric blue on cool grays, high-contrast, oversized touch targets. Optimized for the checkout counter.",
    logo: "stack",
    fontHead: "'Space Grotesk', 'Inter', system-ui, sans-serif",
    fontBody: "'Inter', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', ui-monospace, monospace",
    fontDisplayWeight: 700,
    letterSpacingTight: "-0.03em",
    radius: 8,
    light: {
      bg: "oklch(0.985 0.003 250)",
      bgAlt: "oklch(0.96 0.006 250)",
      surface: "oklch(1 0 0)",
      surfaceAlt: "oklch(0.97 0.005 250)",
      border: "oklch(0.9 0.008 250)",
      borderStrong: "oklch(0.8 0.01 250)",
      text: "oklch(0.15 0.02 250)",
      textMuted: "oklch(0.48 0.015 250)",
      textFaint: "oklch(0.65 0.012 250)",
      primary: "oklch(0.52 0.22 255)",
      primaryFg: "oklch(0.99 0.003 250)",
      primaryHover: "oklch(0.46 0.24 255)",
      accent: "oklch(0.72 0.19 55)",
      accentFg: "oklch(0.15 0.02 250)",
      success: "oklch(0.58 0.16 155)",
      warn: "oklch(0.72 0.19 55)",
      danger: "oklch(0.58 0.22 25)",
      info: "oklch(0.52 0.22 255)",
      chart1: "oklch(0.52 0.22 255)",
      chart2: "oklch(0.72 0.19 55)",
      chart3: "oklch(0.58 0.16 155)",
      chart4: "oklch(0.58 0.22 25)",
      chart5: "oklch(0.55 0.17 300)",
    },
    dark: {
      bg: "oklch(0.18 0.012 250)",
      bgAlt: "oklch(0.21 0.014 250)",
      surface: "oklch(0.235 0.016 250)",
      surfaceAlt: "oklch(0.27 0.018 250)",
      border: "oklch(0.32 0.016 250)",
      borderStrong: "oklch(0.4 0.018 250)",
      text: "oklch(0.93 0.006 250)",
      textMuted: "oklch(0.73 0.01 250)",
      textFaint: "oklch(0.59 0.012 250)",
      primary: "oklch(0.66 0.16 255)",
      primaryFg: "oklch(0.18 0.012 250)",
      primaryHover: "oklch(0.7 0.16 255)",
      accent: "oklch(0.75 0.14 55)",
      accentFg: "oklch(0.18 0.012 250)",
      success: "oklch(0.68 0.13 155)",
      warn: "oklch(0.75 0.14 55)",
      danger: "oklch(0.68 0.16 25)",
      info: "oklch(0.66 0.16 255)",
      chart1: "oklch(0.66 0.16 255)",
      chart2: "oklch(0.75 0.14 55)",
      chart3: "oklch(0.68 0.13 155)",
      chart4: "oklch(0.68 0.16 25)",
      chart5: "oklch(0.68 0.13 300)",
    },
  },
};

/* Density profiles — apply globally, plus POS/Reports auto-overrides in components */
const DENSITY = {
  comfortable: {
    baseFont: 15,
    unit: 4,
    rowHeight: 52,
    inputHeight: 44,
    btnHeight: 44,
    sidebarWidth: 264,
    headerHeight: 68,
    cardPad: 24,
  },
  balanced: {
    baseFont: 14,
    unit: 4,
    rowHeight: 44,
    inputHeight: 38,
    btnHeight: 38,
    sidebarWidth: 248,
    headerHeight: 60,
    cardPad: 20,
  },
  dense: {
    baseFont: 13,
    unit: 4,
    rowHeight: 36,
    inputHeight: 32,
    btnHeight: 32,
    sidebarWidth: 232,
    headerHeight: 52,
    cardPad: 16,
  },
};

function applyTokens({ direction, mode, density, primaryOverride, radiusOverride }) {
  const dir = DIRECTIONS[direction] || DIRECTIONS.ledger;
  const colors = mode === "dark" ? dir.dark : dir.light;
  const den = DENSITY[density] || DENSITY.balanced;
  const root = document.documentElement;

  root.dataset.direction = direction;
  root.dataset.mode = mode;
  root.dataset.density = density;

  // Colors
  Object.entries(colors).forEach(([k, v]) => {
    root.style.setProperty(`--c-${k}`, v);
  });
  if (primaryOverride) {
    root.style.setProperty("--c-primary", primaryOverride);
  }

  // Typography
  root.style.setProperty("--font-head", dir.fontHead);
  root.style.setProperty("--font-body", dir.fontBody);
  root.style.setProperty("--font-mono", dir.fontMono);
  root.style.setProperty("--font-display-weight", dir.fontDisplayWeight);
  root.style.setProperty("--letter-tight", dir.letterSpacingTight);

  // Radius
  const r = radiusOverride != null ? radiusOverride : dir.radius;
  root.style.setProperty("--radius", `${r}px`);
  root.style.setProperty("--radius-sm", `${Math.max(2, r - 4)}px`);
  root.style.setProperty("--radius-lg", `${r + 4}px`);
  root.style.setProperty("--radius-xl", `${r + 10}px`);

  // Density
  root.style.setProperty("--base-font", `${den.baseFont}px`);
  root.style.setProperty("--unit", `${den.unit}px`);
  root.style.setProperty("--row-h", `${den.rowHeight}px`);
  root.style.setProperty("--input-h", `${den.inputHeight}px`);
  root.style.setProperty("--btn-h", `${den.btnHeight}px`);
  root.style.setProperty("--sidebar-w", `${den.sidebarWidth}px`);
  root.style.setProperty("--header-h", `${den.headerHeight}px`);
  root.style.setProperty("--card-pad", `${den.cardPad}px`);
}

window.TT_TOKENS = { DIRECTIONS, DENSITY, applyTokens };
