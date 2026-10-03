/* Business Owner Dashboard — KPIs, sales chart, top products, recent activity, low stock. */

function StatCard({ label, value, delta, deltaDir, sub, Icon }) {
  return (
    <div className="tt-stat">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="tt-stat-label">{label}</div>
        {Icon && (
          <div style={{ width: 28, height: 28, borderRadius: "var(--radius)", background: "color-mix(in oklch, var(--c-primary), transparent 90%)", color: "var(--c-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className="tt-stat-value">{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 20 }}>
        {delta && (
          <div className="tt-stat-delta" data-dir={deltaDir}>
            {deltaDir === "up" ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
            {delta}
          </div>
        )}
        {sub && <div className="tt-muted" style={{ fontSize: 12 }}>{sub}</div>}
      </div>
    </div>
  );
}

function SalesChart() {
  const data = [
    { d: "Mon", v: 240, p: 180 },
    { d: "Tue", v: 310, p: 290 },
    { d: "Wed", v: 285, p: 260 },
    { d: "Thu", v: 380, p: 340 },
    { d: "Fri", v: 445, p: 380 },
    { d: "Sat", v: 520, p: 460 },
    { d: "Sun", v: 482, p: 420 },
  ];
  const max = 600;
  const W = 700;
  const H = 240;
  const stepX = W / (data.length - 1);

  const linePath = (key) =>
    data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${i * stepX} ${H - (d[key] / max) * H}`)
      .join(" ");
  const areaPath = `${linePath("v")} L ${W} ${H} L 0 ${H} Z`;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width={W} height={H + 24} viewBox={`0 0 ${W} ${H + 24}`} style={{ width: "100%", height: "auto" }}>
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--c-primary)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--c-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* grid */}
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" x2={W} y1={(i * H) / 3} y2={(i * H) / 3} stroke="var(--c-border)" strokeDasharray="3 3" />
        ))}
        <path d={areaPath} fill="url(#salesGrad)" />
        <path d={linePath("p")} stroke="var(--c-textFaint)" strokeWidth="1.5" fill="none" strokeDasharray="4 4" />
        <path d={linePath("v")} stroke="var(--c-primary)" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={i * stepX} cy={H - (d.v / max) * H} r={i === data.length - 1 ? 5 : 3} fill="var(--c-primary)" stroke="var(--c-surface)" strokeWidth="2" />
            <text x={i * stepX} y={H + 18} textAnchor="middle" fill="var(--c-textMuted)" fontSize="11" fontFamily="var(--font-body)">{d.d}</text>
          </g>
        ))}
        <text x={data.length * stepX - stepX} y={H - (data[data.length - 1].v / max) * H - 12} textAnchor="middle" fill="var(--c-primary)" fontSize="12" fontWeight="600">₦482k</text>
      </svg>
    </div>
  );
}

const RECENT_SALES = [
  { id: "S-A00248", cashier: "Chika", items: 4, total: 14500, method: "Cash", time: "2m ago" },
  { id: "S-A00247", cashier: "Chika", items: 12, total: 48200, method: "Transfer", time: "6m ago" },
  { id: "S-A00246", cashier: "Bola", items: 2, total: 3800, method: "Cash", time: "12m ago" },
  { id: "S-A00245", cashier: "Chika", items: 8, total: 22400, method: "POS", time: "18m ago" },
  { id: "S-A00244", cashier: "Bola", items: 1, total: 950, method: "Cash", time: "24m ago" },
];

const LOW_STOCK = [
  { name: "Peak Milk · 400g tin", qty: 4, min: 20, sku: "SKU-0812" },
  { name: "Indomie Chicken · Carton", qty: 2, min: 15, sku: "SKU-0119" },
  { name: "Coca-Cola · 50cl", qty: 8, min: 30, sku: "SKU-0028" },
  { name: "Golden Penny Semo · 5kg", qty: 6, min: 25, sku: "SKU-0201" },
];

const TOP_PRODUCTS = [
  { name: "Rice · Mama Gold 25kg", sold: 124, rev: 620000 },
  { name: "Coca-Cola · 50cl", sold: 89, rev: 22250 },
  { name: "Peak Milk · Sachet", sold: 76, rev: 15200 },
  { name: "Indomie Chicken · 70g", sold: 65, rev: 13000 },
];

function Dashboard(props) {
  const { direction, mode } = props;
  return (
    <AppScreen
      {...props}
      role="business_owner"
      active="dashboard"
      title="Good morning, Amaka"
      subtitle="Here's what's happening across your shops today."
      actions={
        <>
          <button className="tt-btn tt-btn-secondary">
            <IconExport size={14} /> Export
          </button>
          <button className="tt-btn tt-btn-primary" onClick={() => props.onNavigate("pos")}>
            <IconCart size={14} /> Open POS
          </button>
        </>
      }
    >
      <Page>
        <div className="tt-flex" style={{ justifyContent: "space-between", marginBottom: 20 }}>
          <div className="tt-seg">
            <div className="tt-seg-item">Today</div>
            <div className="tt-seg-item" data-active="true">This week</div>
            <div className="tt-seg-item">This month</div>
            <div className="tt-seg-item">Custom</div>
          </div>
          <div className="tt-flex">
            <div className="tt-seg">
              <div className="tt-seg-item" data-active="true">All shops</div>
              <div className="tt-seg-item">Aba HQ</div>
              <div className="tt-seg-item">Onitsha</div>
            </div>
          </div>
        </div>

        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Sales this week" value="₦2,145,320" delta="+18.2%" deltaDir="up" sub="vs. last week" Icon={IconTrending} />
          <StatCard label="Transactions" value="742" delta="+12.4%" deltaDir="up" sub="147 today" Icon={IconCart} />
          <StatCard label="Avg. basket" value="₦2,891" delta="-4.1%" deltaDir="down" sub="₦2,952 last week" Icon={IconTag} />
          <StatCard label="Low stock alerts" value="12" sub="Across 3 warehouses" Icon={IconAlert} />
        </div>

        <div className="tt-grid" style={{ gridTemplateColumns: "1.6fr 1fr", marginBottom: 20 }}>
          <div className="tt-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div>
                <div className="tt-eyebrow" style={{ marginBottom: 6 }}>Sales overview</div>
                <div className="tt-section-title">Weekly performance</div>
              </div>
              <div className="tt-flex" style={{ gap: 20, fontSize: 12 }}>
                <div className="tt-flex" style={{ alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--c-primary)" }} />
                  <span>This week</span>
                </div>
                <div className="tt-flex" style={{ alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--c-textFaint)" }} />
                  <span>Last week</span>
                </div>
              </div>
            </div>
            <SalesChart />
          </div>

          <div className="tt-card">
            <div style={{ marginBottom: 16 }}>
              <div className="tt-eyebrow" style={{ marginBottom: 6 }}>Payment mix</div>
              <div className="tt-section-title">This week</div>
            </div>

            {[
              { m: "Cash", v: 62, amt: 1330000, c: "var(--c-primary)" },
              { m: "Bank transfer", v: 24, amt: 515000, c: "var(--c-accent)" },
              { m: "POS card", v: 11, amt: 236000, c: "var(--c-success)" },
              { m: "Split", v: 3, amt: 64000, c: "var(--c-warn)" },
            ].map((p) => (
              <div key={p.m} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: p.c }} />
                    <span>{p.m}</span>
                  </div>
                  <div className="tt-mono tt-tabular">₦{p.amt.toLocaleString()} · {p.v}%</div>
                </div>
                <div className="tt-progress" style={{ height: 4 }}>
                  <div className="tt-progress-bar" style={{ width: `${p.v}%`, background: p.c }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tt-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div className="tt-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div className="tt-eyebrow" style={{ marginBottom: 4 }}>Top products</div>
                <div className="tt-section-title" style={{ fontSize: 18 }}>By revenue · this week</div>
              </div>
              <a style={{ fontSize: 12, color: "var(--c-primary)", cursor: "pointer" }}>View all</a>
            </div>
            {TOP_PRODUCTS.map((p, i) => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--c-border)" }}>
                <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", color: "var(--c-textFaint)", width: 20, textAlign: "center" }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div className="tt-muted" style={{ fontSize: 11, marginTop: 2 }}>{p.sold} sold</div>
                </div>
                <div className="tt-mono tt-tabular" style={{ fontSize: 13, fontWeight: 600 }}>₦{p.rev.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="tt-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div className="tt-eyebrow" style={{ marginBottom: 4 }}>Low stock</div>
                <div className="tt-section-title" style={{ fontSize: 18 }}>Needs restocking</div>
              </div>
              <a onClick={() => props.onNavigate("purchase-orders")} style={{ fontSize: 12, color: "var(--c-primary)", cursor: "pointer" }}>Create PO</a>
            </div>
            {LOW_STOCK.map((p, i) => (
              <div key={p.sku} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--c-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 550, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div className="tt-mono" style={{ fontSize: 11, color: "var(--c-danger)" }}>{p.qty} / {p.min}</div>
                </div>
                <div className="tt-progress" style={{ height: 4 }}>
                  <div className="tt-progress-bar" style={{ width: `${(p.qty / p.min) * 100}%`, background: "var(--c-danger)" }} />
                </div>
              </div>
            ))}
          </div>

          <div className="tt-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div className="tt-eyebrow" style={{ marginBottom: 4 }}>Live activity</div>
                <div className="tt-section-title" style={{ fontSize: 18 }}>Just happened</div>
              </div>
              <span className="tt-badge tt-badge-success"><span style={{ width: 6, height: 6, background: "var(--c-success)", borderRadius: 999 }} /> Live</span>
            </div>
            {RECENT_SALES.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--c-border)" }}>
                <div className="tt-avatar" style={{ background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)", width: 28, height: 28, fontSize: 10 }}>{s.cashier[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 550 }}>{s.cashier} sold {s.items} items</div>
                  <div className="tt-muted" style={{ fontSize: 11 }}>{s.method} · {s.id} · {s.time}</div>
                </div>
                <div className="tt-mono tt-tabular" style={{ fontSize: 13, fontWeight: 600 }}>₦{s.total.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

Object.assign(window, { Dashboard, StatCard, SalesChart });
