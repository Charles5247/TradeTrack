/* Mobile-adapted POS + Dashboard inside AndroidFrame */

function MobilePOSContent({ direction }) {
  const cart = [
    { name: "Rice 25kg", qty: 1, price: 42000 },
    { name: "Peak Milk 400g", qty: 3, price: 3200 },
    { name: "Indomie 70g", qty: 12, price: 250 },
  ];
  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const total = Math.round(subtotal * 1.075);

  return (
    <div style={{ height: "100%", background: "var(--c-bg)", color: "var(--c-text)", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--c-border)", background: "var(--c-surface)", display: "flex", alignItems: "center", gap: 10 }}>
        <button className="tt-btn tt-btn-ghost tt-btn-icon" style={{ height: 36, width: 36 }}><IconMenu size={16} /></button>
        <div style={{ flex: 1 }}>
          <div className="tt-head" style={{ fontSize: 16 }}>POS · Aba HQ</div>
          <div className="tt-muted" style={{ fontSize: 11 }}>Chika · Terminal 02</div>
        </div>
        <span className="tt-badge tt-badge-success" style={{ padding: "0 6px", fontSize: 10 }}><IconWifi size={10} /></span>
      </div>

      <div style={{ padding: 12, background: "var(--c-primary)", color: "var(--c-primaryFg)" }}>
        <div style={{ fontSize: 11, opacity: 0.85 }}>Current sale · 3 min</div>
        <div className="tt-head" style={{ fontSize: 28 }}>₦{total.toLocaleString()}</div>
      </div>

      <div style={{ padding: 12, position: "relative" }}>
        <IconSearch size={14} className="tt-muted" style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)" }} />
        <input className="tt-input" style={{ paddingLeft: 34, paddingRight: 40 }} placeholder="Scan or search…" />
        <IconBarcode size={16} className="tt-muted" style={{ position: "absolute", right: 22, top: "50%", transform: "translateY(-50%)" }} />
      </div>

      <div style={{ padding: "0 12px", display: "flex", gap: 6, overflowX: "auto", marginBottom: 8 }}>
        {["All", "Drinks", "Grains", "Snacks", "Provisions"].map((c) => (
          <button key={c} className="tt-btn tt-btn-secondary tt-btn-sm" style={{ background: c === "All" ? "var(--c-primary)" : undefined, color: c === "All" ? "var(--c-primaryFg)" : undefined, whiteSpace: "nowrap" }}>{c}</button>
        ))}
      </div>

      <div style={{ padding: 12, flex: 1, overflowY: "auto" }}>
        <div style={{ fontSize: 11, color: "var(--c-textMuted)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>In cart · {cart.length}</div>
        {cart.map((c, i) => (
          <div key={i} className="tt-card" style={{ padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
              <div className="tt-mono" style={{ fontSize: 11, color: "var(--c-textMuted)" }}>₦{c.price.toLocaleString()} × {c.qty}</div>
            </div>
            <div className="tt-flex" style={{ alignItems: "center", gap: 4 }}>
              <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconMinus size={12} /></button>
              <div className="tt-mono tt-tabular" style={{ minWidth: 18, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{c.qty}</div>
              <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconPlus size={12} /></button>
            </div>
          </div>
        ))}

        <div style={{ fontSize: 11, color: "var(--c-textMuted)", margin: "16px 0 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick add</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[{ n: "Coca-Cola 50cl", p: 250 }, { n: "Fanta 50cl", p: 250 }, { n: "Titus 125g", p: 950 }, { n: "Blue Band", p: 1200 }].map((p) => (
            <button key={p.n} className="tt-card" style={{ padding: 10, textAlign: "left" }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{p.n}</div>
              <div className="tt-mono" style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>₦{p.p}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 12, borderTop: "1px solid var(--c-border)", background: "var(--c-surface)" }}>
        <button className="tt-btn tt-btn-primary" style={{ width: "100%", height: 52, fontSize: 15, fontWeight: 700 }}>
          Charge ₦{total.toLocaleString()} <IconArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function MobileDashboardContent({ direction }) {
  return (
    <div style={{ height: "100%", background: "var(--c-bg)", color: "var(--c-text)", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" }}>
      <div style={{ padding: "12px 16px", background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", gap: 10 }}>
        <div className="tt-avatar" style={{ background: "var(--c-primary)", color: "var(--c-primaryFg)", width: 32, height: 32 }}>A</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--c-textMuted)" }}>Good morning</div>
          <div className="tt-head" style={{ fontSize: 16 }}>Amaka</div>
        </div>
        <button className="tt-btn tt-btn-ghost tt-btn-icon" style={{ position: "relative" }}>
          <IconBell size={16} />
          <span style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, background: "var(--c-danger)", borderRadius: 999 }} />
        </button>
      </div>

      <div style={{ padding: 12, flex: 1, overflowY: "auto" }}>
        <div className="tt-card" style={{ padding: 16, background: "var(--c-primary)", color: "var(--c-primaryFg)", borderColor: "transparent", marginBottom: 12 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Today's sales · Aba HQ</div>
          <div className="tt-head" style={{ fontSize: 32, marginTop: 6 }}>₦482,190</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <IconArrowUp size={12} /> +18% vs yesterday · 147 sales
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div className="tt-card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--c-textMuted)" }}>Transactions</div>
            <div className="tt-head" style={{ fontSize: 22, marginTop: 4 }}>147</div>
          </div>
          <div className="tt-card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--c-textMuted)" }}>Avg basket</div>
            <div className="tt-head" style={{ fontSize: 22, marginTop: 4 }}>₦3.2k</div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: "var(--c-textMuted)", margin: "16px 0 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { l: "Open POS", Icon: IconCart, primary: true },
            { l: "Scan barcode", Icon: IconBarcode },
            { l: "New PO", Icon: IconClipboard },
            { l: "Reports", Icon: IconChart },
          ].map((a) => (
            <button key={a.l} className="tt-card" style={{ padding: 14, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, background: a.primary ? "var(--c-primary)" : "var(--c-surface)", color: a.primary ? "var(--c-primaryFg)" : "var(--c-text)", borderColor: a.primary ? "transparent" : "var(--c-border)" }}>
              <a.Icon size={18} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{a.l}</span>
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: "var(--c-textMuted)", margin: "16px 0 8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Live activity</div>
        {[
          { n: "Chika sold 4 items", t: "2m", v: "₦14,500" },
          { n: "Chika sold 12 items", t: "6m", v: "₦48,200" },
          { n: "Bola sold 2 items", t: "12m", v: "₦3,800" },
        ].map((s) => (
          <div key={s.t} className="tt-card" style={{ padding: 12, display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div className="tt-avatar" style={{ width: 28, height: 28, fontSize: 10, background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)" }}>{s.n[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 550 }}>{s.n}</div>
              <div className="tt-muted" style={{ fontSize: 10 }}>{s.t} ago</div>
            </div>
            <div className="tt-mono tt-tabular" style={{ fontSize: 13, fontWeight: 600 }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", borderTop: "1px solid var(--c-border)", background: "var(--c-surface)" }}>
        {[
          { l: "Home", Icon: IconDashboard, active: true },
          { l: "POS", Icon: IconCart },
          { l: "Stock", Icon: IconPackage },
          { l: "Reports", Icon: IconChart },
          { l: "More", Icon: IconMenu },
        ].map((n) => (
          <div key={n.l} style={{ flex: 1, padding: "10px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: n.active ? "var(--c-primary)" : "var(--c-textMuted)", cursor: "pointer" }}>
            <n.Icon size={18} />
            <span style={{ fontSize: 10, fontWeight: n.active ? 600 : 500 }}>{n.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileScreens(props) {
  return (
    <div className="tt-content" style={{ background: "var(--c-bgAlt)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Android shell · WebView PWA wrap</div>
          <h1 className="tt-page-title">Mobile — POS & Dashboard</h1>
          <p className="tt-muted" style={{ fontSize: 15, marginTop: 8, maxWidth: 620 }}>Every screen redrawn for a shop cashier holding a ₦40k Android in one hand and change in the other. Touch targets ≥ 44px, one-handed thumb reach zones, big totals.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, justifyItems: "center" }}>
          <div>
            <div className="tt-eyebrow" style={{ textAlign: "center", marginBottom: 16 }}>POS · checkout in hand</div>
            <AndroidDevice width={360} height={720} dark={props.mode === 'dark'}>
              <MobilePOSContent {...props} />
            </AndroidDevice>
          </div>
          <div>
            <div className="tt-eyebrow" style={{ textAlign: "center", marginBottom: 16 }}>Dashboard · morning glance</div>
            <AndroidDevice width={360} height={720} dark={props.mode === 'dark'}>
              <MobileDashboardContent {...props} />
            </AndroidDevice>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MobileScreens });
