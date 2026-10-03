/* TradeTrack logo variants — 3 options, all use current tokens. */

/* Option A: "Ledger" — diamond ledger mark (indigo direction) */
const LogoLedger = ({ size = 32, mono = false, label = true }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="ttA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--c-primary)" />
          <stop offset="1" stopColor={mono ? "var(--c-primary)" : "var(--c-accent)"} />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="32" height="32" rx="8" fill="url(#ttA)" />
      <path d="M12 26 L20 12 L28 26 M15.5 22 H24.5" stroke="var(--c-primaryFg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="20" cy="20" r="2" fill="var(--c-primaryFg)" opacity="0.15" />
    </svg>
    {label && (
      <span style={{ fontFamily: "var(--font-head)", fontWeight: "var(--font-display-weight)", fontSize: size * 0.62, letterSpacing: "var(--letter-tight)", color: "var(--c-text)", lineHeight: 1 }}>
        TradeTrack
      </span>
    )}
  </div>
);

/* Option B: "Market" — stacked crates + leaf accent */
const LogoMarket = ({ size = 32, label = true }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="10" fill="var(--c-primary)" />
      <rect x="10" y="20" width="20" height="10" rx="2" fill="var(--c-primaryFg)" opacity="0.9" />
      <rect x="13" y="14" width="14" height="10" rx="2" fill="var(--c-primaryFg)" opacity="0.7" />
      <path d="M20 6 C 22 8 24 9 27 8 C 26 12 24 14 20 14 C 16 14 14 12 13 8 C 16 9 18 8 20 6 Z" fill="var(--c-accent)" />
    </svg>
    {label && (
      <span style={{ fontFamily: "var(--font-head)", fontWeight: "var(--font-display-weight)", fontSize: size * 0.62, letterSpacing: "var(--letter-tight)", color: "var(--c-text)", lineHeight: 1 }}>
        TradeTrack
      </span>
    )}
  </div>
);

/* Option C: "Operator" — precise grid mark */
const LogoOperator = ({ size = 32, label = true }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="6" fill="var(--c-primary)" />
      <rect x="10" y="10" width="9" height="9" rx="1.5" fill="var(--c-primaryFg)" />
      <rect x="21" y="10" width="9" height="9" rx="1.5" fill="var(--c-primaryFg)" opacity="0.55" />
      <rect x="10" y="21" width="9" height="9" rx="1.5" fill="var(--c-primaryFg)" opacity="0.55" />
      <rect x="21" y="21" width="9" height="9" rx="1.5" fill="var(--c-accent)" />
    </svg>
    {label && (
      <span style={{ fontFamily: "var(--font-head)", fontWeight: "var(--font-display-weight)", fontSize: size * 0.62, letterSpacing: "var(--letter-tight)", color: "var(--c-text)", lineHeight: 1 }}>
        TradeTrack
      </span>
    )}
  </div>
);

/* Option D: "Retail" — bold TT monogram */
const LogoRetail = ({ size = 32, label = true }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="9" fill="var(--c-primary)" />
      <path d="M10 14 H22 M16 14 V28" stroke="var(--c-primaryFg)" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M22 14 H30 M26 14 V28" stroke="var(--c-primaryFg)" strokeWidth="3.2" strokeLinecap="round" opacity="0.6" />
      <circle cx="30" cy="10" r="3" fill="var(--c-accent)" />
    </svg>
    {label && (
      <span style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: size * 0.62, letterSpacing: "var(--letter-tight)", color: "var(--c-text)", lineHeight: 1 }}>
        TradeTrack
      </span>
    )}
  </div>
);

/* Master logo — selects by direction */
const Logo = ({ direction, ...rest }) => {
  const map = { ledger: LogoLedger, market: LogoMarket, operator: LogoOperator, retail: LogoRetail };
  const Cmp = map[direction] || LogoLedger;
  return <Cmp {...rest} />;
};

Object.assign(window, { Logo, LogoLedger, LogoMarket, LogoOperator, LogoRetail });
