/* Production & Hospitality Extension — Restaurants, Bakeries, Hotels, Malls.
 * Layered on top of the core platform as an add-on package. */

/* ─── Industries overview page (marketing) ─── */
function IndustriesPage(props) {
  const industries = [
    {
      key: "restaurant",
      badge: "Restaurant Pack",
      title: "Restaurants, cafés & lounges",
      sub: "From a single-table espresso bar to a 200-seat lounge — TradeTrack handles menus, floors and kitchens with the same rigor it brings to shop counters.",
      photo: "assets/photo-restaurant.jpg",
      screenKey: "prod-restaurant",
      capabilities: ["Kitchen Display System (KDS) with course-firing", "Floor plans, table status, split checks", "Menu modifiers, combos & happy-hour pricing", "Ingredient depletion — every dish reduces stock"],
      price: 5000,
    },
    {
      key: "bakery",
      badge: "Production Pack",
      title: "Bakeries & production kitchens",
      sub: "Recipes with sub-recipes. Batches with yield. Cost of goods that updates the moment a supplier price changes. Expiry alerts before the loaf goes stale.",
      photo: "assets/photo-bakery.jpg",
      screenKey: "prod-bakery",
      capabilities: ["Recipes with sub-recipes & nested BOMs", "Batch scheduling & yield tracking", "Live cost of goods & margin", "Expiry & shelf-life alerts"],
      price: 5000,
    },
    {
      key: "hotel",
      badge: "Hotel Pack",
      title: "Hotels & guest houses",
      sub: "Room inventory, folios that roll up F&B and mini-bar, night-audit ready. Front-desk clarity for owners, without the enterprise-PMS price tag.",
      photo: "assets/photo-african-hotel-women.jpg",
      screenKey: "prod-hotel",
      capabilities: ["Rooms & rate plans, day-view calendar", "Check-in / check-out with folio charges", "F&B and minibar rollup", "Night audit & occupancy reports"],
      price: 12000,
    },
    {
      key: "mall",
      badge: "Mall Manager",
      title: "Shopping malls & multi-tenant",
      sub: "Manage every shop as a tenant. Utility metering, lease renewals, unified footfall & sales dashboards for the mall owner.",
      photo: "assets/photo-mall.jpg",
      screenKey: "prod-mall",
      capabilities: ["Tenant leases & renewals", "Utility metering & sub-invoicing", "Mall-wide sales & footfall dashboard", "Ad spot & event scheduling"],
      price: 25000,
    },
  ];

  return (
    <div className="tt-marketing">
      <MarketingNav {...props} active="industries" />

      {/* Hero */}
      <section style={{ padding: "100px 0 40px", position: "relative", overflow: "hidden" }}>
        <div className="tt-blob tt-blob-float-1" style={{ top: -100, right: -80, width: 500, height: 500, background: "var(--c-accent)", opacity: 0.3 }} />
        <div className="tt-marketing-wrap" style={{ position: "relative" }}>
          <Reveal>
            <div className="tt-badge tt-badge-solid" style={{ background: "var(--c-accent)", color: "var(--c-accentFg)", marginBottom: 16 }}>New · Production & Hospitality</div>
          </Reveal>
          <Reveal delay={100}>
            <h1 className="tt-head" style={{ fontSize: 68, margin: "0 0 20px", maxWidth: 920, lineHeight: 1.02 }}>
              One platform. Every kind of business.
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p style={{ fontSize: 18, color: "var(--c-textMuted)", maxWidth: 640, lineHeight: 1.55 }}>
              The core TradeTrack platform already runs retail, wholesale, and multi-warehouse trade. Our new <b>Production & Hospitality</b> extension packs layer on top — restaurants, bakeries, hotels, and malls — with the same login, same audit trail, and the same Zainpay account.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Alternating industry sections */}
      {industries.map((ind, i) => (
        <section key={ind.key} style={{ padding: "60px 0" }}>
          <div className="tt-marketing-wrap">
            <div className="tt-grid" style={{ gridTemplateColumns: i % 2 === 0 ? "1fr 1.05fr" : "1.05fr 1fr", gap: 60, alignItems: "center" }}>
              <div style={{ order: i % 2 === 0 ? 0 : 1 }}>
                <Reveal>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <span className="tt-badge tt-badge-primary">{ind.badge}</span>
                    <span className="tt-mono tt-muted" style={{ fontSize: 11 }}>+₦{ind.price.toLocaleString()}/mo</span>
                  </div>
                </Reveal>
                <Reveal delay={100}>
                  <h2 className="tt-head" style={{ fontSize: 44, margin: "0 0 16px", lineHeight: 1.08 }}>{ind.title}</h2>
                </Reveal>
                <Reveal delay={200}>
                  <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--c-textMuted)", marginBottom: 24 }}>{ind.sub}</p>
                </Reveal>
                <Reveal delay={300}>
                  <ul style={{ margin: "0 0 28px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                    {ind.capabilities.map((c) => (
                      <li key={c} style={{ display: "flex", gap: 10, fontSize: 14 }}>
                        <IconCheck size={14} style={{ color: "var(--c-success)", marginTop: 4, flexShrink: 0 }} />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
                <Reveal delay={400}>
                  <div className="tt-flex">
                    <button className="tt-btn tt-btn-primary" onClick={() => props.onNavigate(ind.screenKey)}>See it live <IconArrowRight size={14} /></button>
                    <button className="tt-btn tt-btn-secondary" onClick={() => props.onNavigate("pricing")}>See pricing</button>
                  </div>
                </Reveal>
              </div>

              <Reveal delay={200}>
                <div className="tt-card" style={{ padding: 0, overflow: "hidden", position: "relative", aspectRatio: "16 / 11", boxShadow: "0 30px 60px -15px color-mix(in oklch, var(--c-primary), transparent 78%)" }}>
                  <div style={{ position: "absolute", inset: 0, backgroundImage: `url('${ind.photo}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      ))}

      <CTABand {...props} />
      <Footer {...props} />
    </div>
  );
}

/* ─── Restaurant Console (in-app screen) ─── */
function RestaurantScreen(props) {
  const orders = [
    { t: "5", table: "Table 4 · 2 pax", items: ["Jollof Rice ×2", "Grilled Tilapia", "Chapman ×2"], status: "firing", elapsed: 5, station: "Grill" },
    { t: "12", table: "Table 8 · 4 pax", items: ["Amala + Ewedu", "Peppered Snail", "Beef Suya"], status: "cooking", elapsed: 12, station: "Grill" },
    { t: "3", table: "Table 2 · 1 pax", items: ["Espresso", "Croissant"], status: "new", elapsed: 3, station: "Bar" },
    { t: "8", table: "Takeaway #4421", items: ["Egusi Soup", "Pounded Yam", "Palm Wine 75cl"], status: "cooking", elapsed: 8, station: "Kitchen" },
    { t: "18", table: "Table 12 · 6 pax", items: ["Fried Rice ×3", "Chicken ×3", "Cocktails ×2"], status: "ready", elapsed: 18, station: "Kitchen" },
    { t: "22", table: "Table 6 · 2 pax", items: ["Seafood Okra", "Semo", "Zobo"], status: "delivered", elapsed: 22, station: "Kitchen" },
  ];
  const statusColor = (s) => ({ new: "info", firing: "warn", cooking: "primary", ready: "success", delivered: "neutral" })[s];
  const statusLabel = (s) => ({ new: "New", firing: "Firing", cooking: "Cooking", ready: "Ready", delivered: "Served" })[s];

  return (
    <AppScreen {...props} role="business_owner" active="restaurant"
      orgName="Kilimanjaro Kitchen · Lekki" userName="Chika"
      title="Kitchen Display · Restaurant"
      subtitle="4 stations · 6 active orders · avg. 12 min ticket time"
      breadcrumb={["Extension", "Restaurant Pack"]}
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconPrinter size={14} /> Reprint dockets</button>
        <button className="tt-btn tt-btn-primary" onClick={() => props.onNavigate("prod-menu")}><IconEdit size={14} /> Edit menu</button>
      </>}
    >
      <Page wide>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Covers tonight" value="84" delta="+22%" deltaDir="up" sub="vs. last Fri" Icon={IconUsers} />
          <StatCard label="Table turn" value="1.8 h" delta="-12min" deltaDir="up" sub="Target 2.0h" Icon={IconHistory} />
          <StatCard label="Avg. ticket time" value="12m 08s" sub="Grill fastest at 8m" Icon={IconTerminal} />
          <StatCard label="Revenue tonight" value="₦482,190" delta="+18%" deltaDir="up" Icon={IconDollar} />
        </div>

        <div className="tt-flex" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="tt-seg">
            <div className="tt-seg-item" data-active="true">All stations (6)</div>
            <div className="tt-seg-item">Kitchen (3)</div>
            <div className="tt-seg-item">Grill (2)</div>
            <div className="tt-seg-item">Bar (1)</div>
            <div className="tt-seg-item">Pastry (0)</div>
          </div>
          <div className="tt-flex">
            <span className="tt-badge tt-badge-success"><span className="tt-dot-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--c-success)" }} /> Live · updated 2s ago</span>
          </div>
        </div>

        {/* KDS ticket grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {orders.map((o) => (
            <div key={o.t} className="tt-card" style={{ padding: 0, overflow: "hidden", borderTop: `4px solid var(--c-${statusColor(o.status) === "neutral" ? "border" : statusColor(o.status)})` }}>
              <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--c-surfaceAlt)" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{o.table}</div>
                  <div className="tt-mono tt-muted" style={{ fontSize: 11 }}>{o.station} · #{2401 + parseInt(o.t)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tt-mono tt-tabular" style={{ fontSize: 20, fontWeight: 700, color: o.elapsed > 15 ? "var(--c-danger)" : o.elapsed > 10 ? "var(--c-warn)" : "var(--c-text)" }}>{o.elapsed}:00</div>
                  <span className={`tt-badge tt-badge-${statusColor(o.status)}`}>{statusLabel(o.status)}</span>
                </div>
              </div>
              <div style={{ padding: 18 }}>
                {o.items.map((it, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i === o.items.length - 1 ? "none" : "1px dashed var(--c-border)" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid var(--c-border)", flexShrink: 0 }} />
                    <div style={{ fontSize: 14, fontWeight: 550 }}>{it}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding: "12px 18px", background: "var(--c-surfaceAlt)", display: "flex", gap: 8 }}>
                <button className="tt-btn tt-btn-primary tt-btn-sm" style={{ flex: 1 }}>Fire → Ready</button>
                <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconMore size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </Page>
    </AppScreen>
  );
}

/* ─── Bakery / Production Screen ─── */
function BakeryScreen(props) {
  const batches = [
    { id: "B-4421", recipe: "Agege Bread · Loaf 800g", qty: 240, yield: 234, done: 234, start: "04:20", end: "06:15", cost: 92400, revenue: 240000, status: "completed" },
    { id: "B-4422", recipe: "Meat Pie · Standard", qty: 480, yield: null, done: 320, start: "05:10", end: "—", cost: 118000, revenue: null, status: "in-progress" },
    { id: "B-4423", recipe: "Chin-Chin · 500g pack", qty: 120, yield: null, done: 0, start: "07:00", end: "—", cost: 34000, revenue: null, status: "queued" },
    { id: "B-4420", recipe: "Puff Puff · 12-pack", qty: 60, yield: 60, done: 60, start: "03:00", end: "04:45", cost: 12200, revenue: 24000, status: "completed" },
  ];
  const st = (s) => s === "completed" ? "success" : s === "in-progress" ? "warn" : "neutral";
  return (
    <AppScreen {...props} role="business_owner" active="bakery"
      orgName="Nikkoos Bakery · Surulere" userName="Kunle"
      title="Production · Bakery"
      subtitle="4 batches today · ₦256,000 revenue projected"
      breadcrumb={["Extension", "Production Pack"]}
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconClipboard size={14} /> Recipes</button>
        <button className="tt-btn tt-btn-primary"><IconPlus size={14} /> Start batch</button>
      </>}
    >
      <Page>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Units baked today" value="614" delta="+8%" deltaDir="up" Icon={IconPackage} />
          <StatCard label="Cost of goods" value="₦256,600" sub="46% of revenue" Icon={IconDollar} />
          <StatCard label="Avg. yield" value="97.5%" delta="+1.2pp" deltaDir="up" sub="Loss under 3%" Icon={IconTrending} />
          <StatCard label="Expiring in 24h" value="18" sub="Discount before waste" Icon={IconAlert} />
        </div>

        <div className="tt-grid" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 20 }}>
          <div className="tt-card">
            <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 6 }}>Today's batches</div>
            <div className="tt-muted" style={{ fontSize: 13, marginBottom: 16 }}>Real-time. Each batch pulls ingredients from stock as it runs.</div>
            <table className="tt-table">
              <thead>
                <tr><th>Batch #</th><th>Recipe</th><th style={{ textAlign: "right" }}>Target</th><th style={{ textAlign: "right" }}>Made</th><th style={{ textAlign: "right" }}>Yield</th><th style={{ textAlign: "right" }}>Cost</th><th>Status</th></tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="tt-mono" style={{ fontWeight: 600 }}>{b.id}</td>
                    <td style={{ fontWeight: 550 }}>{b.recipe}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>{b.qty}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>{b.done}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right", color: b.yield ? "var(--c-success)" : "var(--c-textFaint)" }}>{b.yield ? `${((b.yield / b.qty) * 100).toFixed(1)}%` : "—"}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>₦{b.cost.toLocaleString()}</td>
                    <td><span className={`tt-badge tt-badge-${st(b.status)}`}>{b.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tt-card">
            <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 16 }}>Recipe · Agege Bread 800g</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div className="tt-muted" style={{ fontSize: 12 }}>Sell price</div>
                <div className="tt-head" style={{ fontSize: 22 }}>₦1,000</div>
              </div>
              <div>
                <div className="tt-muted" style={{ fontSize: 12 }}>Cost / loaf</div>
                <div className="tt-head" style={{ fontSize: 22 }}>₦385</div>
              </div>
              <div>
                <div className="tt-muted" style={{ fontSize: 12 }}>Margin</div>
                <div className="tt-head" style={{ fontSize: 22, color: "var(--c-success)" }}>61.5%</div>
              </div>
            </div>
            <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Bill of materials · per loaf</div>
            {[
              { i: "Flour · Golden Penny", q: "480g", c: 210 },
              { i: "Yeast · Angel", q: "6g", c: 12 },
              { i: "Sugar", q: "20g", c: 8 },
              { i: "Butter · Blue Band", q: "15g", c: 45 },
              { i: "Milk (evaporated)", q: "30ml", c: 40 },
              { i: "Salt", q: "4g", c: 2 },
              { i: "Labour (allocated)", q: "8min", c: 48 },
              { i: "Packaging + gas", q: "1", c: 20 },
            ].map((r) => (
              <div key={r.i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px dashed var(--c-border)" }}>
                <span>{r.i}</span>
                <span>
                  <span className="tt-mono tt-muted" style={{ marginRight: 12, fontSize: 11 }}>{r.q}</span>
                  <span className="tt-mono tt-tabular">₦{r.c}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

/* ─── Hotel Screen ─── */
function HotelScreen(props) {
  const rooms = [
    { n: "101", type: "Standard", guest: "—", status: "clean", price: 25000 },
    { n: "102", type: "Standard", guest: "Ade Okafor · 2 nights", status: "occupied", price: 25000 },
    { n: "103", type: "Standard", guest: "—", status: "dirty", price: 25000 },
    { n: "201", type: "Deluxe", guest: "Ms. Nkechi · 4 nights", status: "occupied", price: 42000 },
    { n: "202", type: "Deluxe", guest: "—", status: "clean", price: 42000 },
    { n: "203", type: "Deluxe", guest: "J. Chinedu · 1 night", status: "occupied", price: 42000 },
    { n: "204", type: "Deluxe", guest: "—", status: "maintenance", price: 42000 },
    { n: "301", type: "Suite", guest: "M. Bello Group · 3 nights", status: "occupied", price: 85000 },
    { n: "302", type: "Suite", guest: "—", status: "clean", price: 85000 },
    { n: "303", type: "Suite", guest: "—", status: "reserved", price: 85000 },
  ];
  const color = (s) => ({ clean: "success", occupied: "primary", dirty: "warn", maintenance: "danger", reserved: "info" })[s];
  const label = (s) => ({ clean: "Ready", occupied: "Occupied", dirty: "To clean", maintenance: "Repair", reserved: "Reserved" })[s];

  return (
    <AppScreen {...props} role="business_owner" active="hotel"
      orgName="Lekki Grand Hotel" userName="Blessing"
      title="Front Desk · Hotel"
      subtitle="10 rooms · 5 occupied · 68% occupancy tonight"
      breadcrumb={["Extension", "Hotel Pack"]}
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconClipboard size={14} /> Night audit</button>
        <button className="tt-btn tt-btn-primary"><IconPlus size={14} /> New reservation</button>
      </>}
    >
      <Page wide>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Occupancy tonight" value="68%" delta="+12pp" deltaDir="up" sub="7 of 10 rooms" Icon={IconBuilding} />
          <StatCard label="ADR · Avg. daily rate" value="₦48,400" delta="+₦2,100" deltaDir="up" Icon={IconDollar} />
          <StatCard label="RevPAR" value="₦32,900" delta="+18%" deltaDir="up" sub="Rev per available room" Icon={IconTrending} />
          <StatCard label="F&B revenue today" value="₦124,600" sub="From folios auto-rolled" Icon={IconLayers} />
        </div>

        <div className="tt-grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
          <div className="tt-card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div className="tt-section-title" style={{ fontSize: 18 }}>Room map · 27 Aug 2026</div>
              <div className="tt-flex" style={{ gap: 12, fontSize: 11 }}>
                {[["clean", "Ready"], ["occupied", "Occupied"], ["dirty", "To clean"], ["reserved", "Reserved"], ["maintenance", "Repair"]].map(([s, l]) => (
                  <div key={s} className="tt-flex" style={{ alignItems: "center", gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: `var(--c-${color(s)})` }} /> {l}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
              {rooms.map((r) => (
                <div key={r.n} className="tt-card" style={{ padding: 14, position: "relative", borderLeft: `4px solid var(--c-${color(r.status)})`, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div className="tt-head" style={{ fontSize: 18 }}>{r.n}</div>
                    <span className={`tt-badge tt-badge-${color(r.status)}`} style={{ padding: "0 6px", fontSize: 9 }}>{label(r.status)}</span>
                  </div>
                  <div className="tt-muted" style={{ fontSize: 11, marginTop: 2 }}>{r.type}</div>
                  <div style={{ fontSize: 11, marginTop: 8, minHeight: 26, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {r.guest === "—" ? <span className="tt-muted">Vacant</span> : r.guest}
                  </div>
                  <div className="tt-mono tt-tabular" style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>₦{r.price.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="tt-flex-col">
            <div className="tt-card">
              <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 6 }}>Room 301 · M. Bello Group</div>
              <div className="tt-muted" style={{ fontSize: 12, marginBottom: 16 }}>Suite · 24 Aug → 27 Aug · 3 nights · 4 guests</div>
              <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Live folio</div>
              {[
                ["Room 301 · 3 nights", 255000],
                ["Room service · 24 Aug", 8400],
                ["Minibar · 25 Aug", 3200],
                ["Restaurant · dinner", 24800],
                ["Laundry service", 4500],
                ["Airport transfer", 15000],
              ].map((r) => (
                <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed var(--c-border)", fontSize: 13 }}>
                  <span>{r[0]}</span>
                  <span className="tt-mono tt-tabular">₦{r[1].toLocaleString()}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 6, borderTop: "2px solid var(--c-border)" }}>
                <span style={{ fontWeight: 700 }}>Balance</span>
                <span className="tt-head" style={{ fontSize: 22 }}>₦310,900</span>
              </div>
              <div className="tt-flex" style={{ marginTop: 12 }}>
                <button className="tt-btn tt-btn-secondary" style={{ flex: 1 }}>Post charge</button>
                <button className="tt-btn tt-btn-primary" style={{ flex: 1 }}>Check out</button>
              </div>
            </div>

            <div className="tt-card">
              <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Arrivals · today</div>
              {[
                { g: "Aisha Bello", r: "202 Deluxe", t: "14:00" },
                { g: "Corporate · 3 rms", r: "204+", t: "17:30" },
                { g: "Nkechi Onwuka", r: "302 Suite", t: "20:15" },
              ].map((a) => (
                <div key={a.g} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--c-border)" }}>
                  <div className="tt-avatar" style={{ width: 32, height: 32, background: "color-mix(in oklch, var(--c-primary), transparent 85%)", color: "var(--c-primary)" }}>{a.g[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 550 }}>{a.g}</div>
                    <div className="tt-muted" style={{ fontSize: 11 }}>{a.r}</div>
                  </div>
                  <div className="tt-mono tt-tabular" style={{ fontSize: 12 }}>{a.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

/* ─── Mall Manager Screen ─── */
function MallScreen(props) {
  const tenants = [
    { u: "A-101", name: "Aliko Fashion Lounge", type: "Boutique", area: 82, rent: 850000, occupancy: "3y", status: "current", revenue: 4200000 },
    { u: "A-102", name: "Mama Nkechi Kitchen", type: "Restaurant", area: 140, rent: 1400000, occupancy: "1y", status: "current", revenue: 6800000 },
    { u: "A-103", name: "Chuka Electronics", type: "Retail", area: 96, rent: 960000, occupancy: "2y", status: "current", revenue: 3100000 },
    { u: "A-201", name: "Prime Barber Studio", type: "Services", area: 34, rent: 380000, occupancy: "6m", status: "overdue", revenue: 1200000 },
    { u: "A-202", name: "The Coffee Room", type: "Café", area: 48, rent: 520000, occupancy: "8m", status: "current", revenue: 1900000 },
    { u: "A-203", name: "—", type: "Vacant", area: 62, rent: null, occupancy: "—", status: "vacant", revenue: 0 },
    { u: "B-101", name: "Silverbird Cinema", type: "Entertainment", area: 640, rent: 4800000, occupancy: "4y", status: "current", revenue: 18400000 },
    { u: "B-201", name: "Fitness First", type: "Gym", area: 320, rent: 2400000, occupancy: "2y", status: "current", revenue: 4600000 },
  ];
  const stat = (s) => ({ current: "success", overdue: "danger", vacant: "neutral" })[s];

  return (
    <AppScreen {...props} role="platform_owner" active="mall"
      userRole="platform_owner" orgName="Ajah Grand Mall" userName="Charles"
      title="Mall Manager · Ajah Grand"
      subtitle="24 units · 22 occupied · ₦18.4M rent this month"
      breadcrumb={["Extension", "Mall Manager"]}
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconExport size={14} /> Owner report</button>
        <button className="tt-btn tt-btn-primary"><IconPlus size={14} /> Add tenant</button>
      </>}
    >
      <Page wide>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Occupancy" value="91.7%" delta="+2pp" deltaDir="up" sub="22 of 24 units" Icon={IconGrid} />
          <StatCard label="Rent collected · Aug" value="₦18.4M" delta="+₦1.2M" deltaDir="up" sub="98% of due" Icon={IconDollar} />
          <StatCard label="Tenant sales · combined" value="₦42.3M" delta="+15%" deltaDir="up" sub="Aug MoM" Icon={IconTrending} />
          <StatCard label="Footfall · this week" value="24,180" delta="+8%" deltaDir="up" sub="Peak Sat 18:00" Icon={IconUsers} />
        </div>

        <div className="tt-grid" style={{ gridTemplateColumns: "2fr 1fr", gap: 20 }}>
          <div className="tt-card" style={{ padding: 0 }}>
            <div style={{ padding: 20, borderBottom: "1px solid var(--c-border)", display: "flex", justifyContent: "space-between" }}>
              <div className="tt-section-title" style={{ fontSize: 18 }}>Tenants · Block A + B</div>
              <div className="tt-flex">
                <button className="tt-btn tt-btn-secondary tt-btn-sm">All blocks</button>
                <button className="tt-btn tt-btn-secondary tt-btn-sm">All types</button>
                <button className="tt-btn tt-btn-secondary tt-btn-sm">Overdue</button>
              </div>
            </div>
            <table className="tt-table">
              <thead>
                <tr><th>Unit</th><th>Tenant</th><th>Type</th><th style={{ textAlign: "right" }}>Area (m²)</th><th style={{ textAlign: "right" }}>Rent/mo</th><th style={{ textAlign: "right" }}>Sales · Aug</th><th>Status</th></tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.u}>
                    <td className="tt-mono" style={{ fontWeight: 600 }}>{t.u}</td>
                    <td style={{ fontWeight: 550, color: t.status === "vacant" ? "var(--c-textFaint)" : "var(--c-text)" }}>{t.name}</td>
                    <td className="tt-muted">{t.type}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>{t.area}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 600 }}>{t.rent ? `₦${t.rent.toLocaleString()}` : "—"}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right", color: t.revenue > 0 ? "var(--c-text)" : "var(--c-textFaint)" }}>{t.revenue > 0 ? `₦${(t.revenue / 1_000_000).toFixed(1)}M` : "—"}</td>
                    <td><span className={`tt-badge tt-badge-${stat(t.status)}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tt-flex-col">
            <div className="tt-card">
              <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Utilities · this month</div>
              {[
                { l: "Electricity (IKEDC)", v: 4800000, u: "82,410 kWh" },
                { l: "Water (LWC)", v: 620000, u: "1,824 m³" },
                { l: "Generator (diesel)", v: 1240000, u: "3,120 L" },
                { l: "Waste management", v: 280000, u: "22 pickups" },
              ].map((r) => (
                <div key={r.l} style={{ padding: "10px 0", borderBottom: "1px solid var(--c-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 550 }}>{r.l}</span>
                    <span className="tt-mono tt-tabular" style={{ fontSize: 13, fontWeight: 600 }}>₦{r.v.toLocaleString()}</span>
                  </div>
                  <div className="tt-mono tt-muted" style={{ fontSize: 11 }}>{r.u} · sub-metered</div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid var(--c-border)", marginTop: 6 }}>
                <span style={{ fontWeight: 700 }}>Total to allocate</span>
                <span className="tt-head" style={{ fontSize: 20 }}>₦6.94M</span>
              </div>
              <button className="tt-btn tt-btn-primary" style={{ width: "100%", marginTop: 12 }}>Generate tenant invoices</button>
            </div>

            <div className="tt-card">
              <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Overdue tenants</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
                <div style={{ width: 40, height: 40, borderRadius: "var(--radius)", background: "color-mix(in oklch, var(--c-danger), transparent 85%)", color: "var(--c-danger)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconAlert size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Prime Barber Studio</div>
                  <div className="tt-muted" style={{ fontSize: 11 }}>A-201 · 18 days overdue</div>
                </div>
                <div className="tt-mono tt-tabular" style={{ fontWeight: 700, color: "var(--c-danger)" }}>₦380k</div>
              </div>
            </div>
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

Object.assign(window, { IndustriesPage, RestaurantScreen, BakeryScreen, HotelScreen, MallScreen });
