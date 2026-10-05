/* Design system reference — the tokens & components doc */

function Swatch({ name, cssVar, code }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ height: 84, borderRadius: "var(--radius)", background: `var(--${cssVar})`, border: "1px solid var(--c-border)" }} />
      <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
      <div className="tt-mono tt-muted" style={{ fontSize: 11 }}>{code || cssVar}</div>
    </div>
  );
}

function SystemPage(props) {
  const { direction, mode } = props;
  const dir = window.TT_TOKENS.DIRECTIONS[direction];
  const colors = mode === "dark" ? dir.dark : dir.light;

  return (
    <div className="tt-content" style={{ background: "var(--c-bg)", minHeight: "100vh", padding: "40px 24px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 40 }}>
          <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Design System · {dir.name} direction</div>
          <h1 className="tt-page-title">TradeTrack Design Tokens</h1>
          <p className="tt-muted" style={{ fontSize: 15, marginTop: 8, maxWidth: 640 }}>Every screen in this proposal is drawn from these tokens. Switch directions or dark/light at the top; every component below re-renders live.</p>
        </div>

        {/* Logo variants */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 8 }}>Logo · 4 options</div>
          <p className="tt-muted" style={{ fontSize: 13, marginBottom: 20 }}>Each mark is paired with a direction — pick the one you want, or mix & match.</p>
          <div className="tt-grid tt-grid-4">
            {[
              { name: "A · Ledger diamond", Cmp: LogoLedger },
              { name: "B · Market crate & leaf", Cmp: LogoMarket },
              { name: "C · Operator grid", Cmp: LogoOperator },
              { name: "D · Retail monogram", Cmp: LogoRetail },
            ].map((l) => (
              <div key={l.name} className="tt-card" style={{ padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
                <l.Cmp size={56} label={false} />
                <l.Cmp size={28} />
                <div className="tt-muted" style={{ fontSize: 11, textAlign: "center" }}>{l.name}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Colors */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 20 }}>Color · {mode} mode</div>
          <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
            <Swatch name="Primary" cssVar="c-primary" code={colors.primary} />
            <Swatch name="Accent" cssVar="c-accent" code={colors.accent} />
            <Swatch name="Surface" cssVar="c-surface" code={colors.surface} />
            <Swatch name="Background" cssVar="c-bg" code={colors.bg} />
          </div>
          <div className="tt-grid tt-grid-4">
            <Swatch name="Success" cssVar="c-success" code={colors.success} />
            <Swatch name="Warn" cssVar="c-warn" code={colors.warn} />
            <Swatch name="Danger" cssVar="c-danger" code={colors.danger} />
            <Swatch name="Info" cssVar="c-info" code={colors.info} />
          </div>
        </section>

        {/* Type */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 20 }}>Typography</div>
          <div className="tt-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div className="tt-card">
              <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Display · {dir.fontHead.split(",")[0].replace(/'/g, "")}</div>
              <div className="tt-head" style={{ fontSize: 60, lineHeight: 1 }}>Aa</div>
              <div className="tt-head" style={{ fontSize: 32, marginTop: 8 }}>The quick brown fox</div>
              <div className="tt-head" style={{ fontSize: 20, marginTop: 4 }}>Numbers · 1,234,567.89 · ₦</div>
            </div>
            <div className="tt-card">
              <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Body · {dir.fontBody.split(",")[0].replace(/'/g, "")}</div>
              <div style={{ fontSize: 60, lineHeight: 1 }}>Aa</div>
              <div style={{ fontSize: 15, marginTop: 12, lineHeight: 1.55 }}>TradeTrack helps Nigerian traders sell, restock, and report from a single dashboard. Body text stays legible at 13–15px, with tabular numbers for money and mono for identifiers.</div>
              <div className="tt-mono" style={{ marginTop: 12, fontSize: 12, color: "var(--c-textMuted)" }}>{dir.fontMono.split(",")[0].replace(/'/g, "")} · SKU-1024 · ₦42,000.00</div>
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 20 }}>Buttons</div>
          <div className="tt-card">
            <div className="tt-flex" style={{ marginBottom: 16, flexWrap: "wrap" }}>
              <button className="tt-btn tt-btn-primary">Primary</button>
              <button className="tt-btn tt-btn-secondary">Secondary</button>
              <button className="tt-btn tt-btn-ghost">Ghost</button>
              <button className="tt-btn tt-btn-danger">Danger</button>
            </div>
            <div className="tt-flex" style={{ marginBottom: 16, flexWrap: "wrap" }}>
              <button className="tt-btn tt-btn-primary tt-btn-lg">Large primary <IconArrowRight size={14} /></button>
              <button className="tt-btn tt-btn-primary">Normal <IconArrowRight size={14} /></button>
              <button className="tt-btn tt-btn-primary tt-btn-sm">Small</button>
              <button className="tt-btn tt-btn-primary tt-btn-icon"><IconPlus size={14} /></button>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 20 }}>Badges</div>
          <div className="tt-card">
            <div className="tt-flex" style={{ flexWrap: "wrap" }}>
              <span className="tt-badge tt-badge-primary">Primary</span>
              <span className="tt-badge tt-badge-neutral">Neutral</span>
              <span className="tt-badge tt-badge-info">Info</span>
              <span className="tt-badge tt-badge-success"><IconCheck size={10} /> Active</span>
              <span className="tt-badge tt-badge-warn"><IconAlert size={10} /> Low</span>
              <span className="tt-badge tt-badge-danger"><IconX size={10} /> Out</span>
              <span className="tt-badge tt-badge-solid">Solid</span>
            </div>
          </div>
        </section>

        {/* Inputs */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 20 }}>Forms</div>
          <div className="tt-card">
            <div className="tt-grid tt-grid-3" style={{ gap: 16 }}>
              <div>
                <label className="tt-label">Text input</label>
                <input className="tt-input" defaultValue="Amaka Onyeka" />
              </div>
              <div>
                <label className="tt-label">Numeric</label>
                <input className="tt-input tt-mono tt-tabular" defaultValue="₦42,000" />
              </div>
              <div>
                <label className="tt-label">Select</label>
                <select className="tt-input"><option>Growth plan</option><option>Business plan</option></select>
              </div>
            </div>
          </div>
        </section>

        {/* Radius scale */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 20 }}>Radius scale</div>
          <div className="tt-card">
            <div className="tt-grid tt-grid-4">
              {[
                { l: "sm", v: "var(--radius-sm)" },
                { l: "md", v: "var(--radius)" },
                { l: "lg", v: "var(--radius-lg)" },
                { l: "xl", v: "var(--radius-xl)" },
              ].map((r) => (
                <div key={r.l}>
                  <div style={{ height: 60, background: "var(--c-primary)", borderRadius: r.v, marginBottom: 8 }} />
                  <div className="tt-mono" style={{ fontSize: 11, color: "var(--c-textMuted)" }}>{r.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stat cards */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 20 }}>Cards & stats</div>
          <div className="tt-grid tt-grid-4">
            <StatCard label="Sales today" value="₦482k" delta="+18%" deltaDir="up" Icon={IconTrending} />
            <StatCard label="Orders open" value="7" sub="₦2.4M committed" Icon={IconClipboard} />
            <StatCard label="Low stock" value="12" sub="Across 3 warehouses" Icon={IconAlert} />
            <StatCard label="Users active" value="5" delta="+1" deltaDir="up" Icon={IconUsers} />
          </div>
        </section>

        {/* States & templates */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 8 }}>States & templates</div>
          <p className="tt-muted" style={{ fontSize: 13, marginBottom: 20 }}>Every screen inherits these. Use them for consistency.</p>
          <StatesExamples />
        </section>

        {/* Icon library */}
        <section style={{ marginBottom: 40 }}>
          <div className="tt-section-title" style={{ marginBottom: 8 }}>Icon set</div>
          <p className="tt-muted" style={{ fontSize: 13, marginBottom: 20 }}>Lucide-style · 1.75 stroke · matches the existing codebase's icon library.</p>
          <div className="tt-card">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
              {["Dashboard", "Package", "Warehouse", "Cart", "History", "Transfer", "Clipboard", "Users", "Chart", "Audit", "Bell", "Settings", "Card", "Shield", "Building", "Search", "Barcode", "Printer", "Naira", "Star", "Info", "Alert", "CheckCircle", "Refresh"].map((n) => {
                const Ic = window[`Icon${n}`];
                return (
                  <div key={n} className="tt-card-flat" style={{ padding: 12, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    {Ic && <Ic size={20} />}
                    <div className="tt-mono" style={{ fontSize: 9, color: "var(--c-textMuted)" }}>{n}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { SystemPage });
