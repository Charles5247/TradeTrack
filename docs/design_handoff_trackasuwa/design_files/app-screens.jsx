/* Combined dashboard screens: Products, Inventory, Purchase Orders, Transfers, Vendors,
 * Sales History, Reports, Audit, Notifications, Settings. All follow the AppScreen shell. */

const PRODUCTS = [
  { sku: "SKU-1024", name: "Rice Mama Gold 25kg", cat: "Grains", price: 42000, cost: 38000, stock: 18, warehouse: "Aba HQ", status: "active" },
  { sku: "SKU-1018", name: "Golden Penny Semo 5kg", cat: "Grains", price: 6200, cost: 5300, stock: 6, warehouse: "Aba HQ", status: "active", low: true },
  { sku: "SKU-0812", name: "Peak Milk 400g", cat: "Provisions", price: 3200, cost: 2600, stock: 4, warehouse: "Aba HQ", status: "active", low: true },
  { sku: "SKU-0119", name: "Indomie Chicken 70g", cat: "Snacks", price: 250, cost: 180, stock: 120, warehouse: "Aba HQ", status: "active" },
  { sku: "SKU-0028", name: "Coca-Cola 50cl", cat: "Drinks", price: 250, cost: 200, stock: 48, warehouse: "Aba HQ", status: "active" },
  { sku: "SKU-0044", name: "Fanta Orange 50cl", cat: "Drinks", price: 250, cost: 200, stock: 32, warehouse: "Aba HQ", status: "active" },
  { sku: "SKU-0301", name: "Titus Sardine 125g", cat: "Provisions", price: 950, cost: 780, stock: 42, warehouse: "Onitsha", status: "active" },
  { sku: "SKU-0512", name: "Ariel Detergent 900g", cat: "Household", price: 2100, cost: 1750, stock: 24, warehouse: "Aba HQ", status: "active" },
  { sku: "SKU-0619", name: "Milo Refill 400g", cat: "Provisions", price: 3500, cost: 2900, stock: 22, warehouse: "Onitsha", status: "active" },
  { sku: "SKU-0788", name: "Blue Band Margarine 500g", cat: "Provisions", price: 1200, cost: 950, stock: 0, warehouse: "Aba HQ", status: "out" },
];

function Products(props) {
  return (
    <AppScreen {...props} role="business_owner" active="products"
      title="Products"
      subtitle="1,248 SKUs across 3 warehouses"
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconUpload size={14} /> Import</button>
        <button className="tt-btn tt-btn-secondary"><IconExport size={14} /> Export</button>
        <button className="tt-btn tt-btn-primary"><IconPlus size={14} /> Add product</button>
      </>}
    >
      <Page>
        <div className="tt-flex" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="tt-flex">
            <div style={{ position: "relative", width: 320 }}>
              <IconSearch size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input className="tt-input" style={{ paddingLeft: 34 }} placeholder="Search SKU or name…" />
            </div>
            <button className="tt-btn tt-btn-secondary"><IconFilter size={14} /> All categories</button>
            <button className="tt-btn tt-btn-secondary">All warehouses</button>
            <button className="tt-btn tt-btn-secondary">In stock</button>
          </div>
          <div className="tt-seg">
            <div className="tt-seg-item" data-active="true">Table</div>
            <div className="tt-seg-item">Grid</div>
          </div>
        </div>

        <div className="tt-card" style={{ padding: 0 }}>
          <table className="tt-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" /></th>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Warehouse</th>
                <th style={{ textAlign: "right" }}>Cost</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Stock</th>
                <th>Status</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTS.map((p) => (
                <tr key={p.sku}>
                  <td><input type="checkbox" /></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="tt-placeholder" style={{ width: 32, height: 32, fontSize: 8 }}>img</div>
                      <div>
                        <div style={{ fontWeight: 550 }}>{p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="tt-mono tt-faint">{p.sku}</td>
                  <td>{p.cat}</td>
                  <td>{p.warehouse}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>₦{p.cost.toLocaleString()}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 600 }}>₦{p.price.toLocaleString()}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right", color: p.low || p.status === "out" ? "var(--c-danger)" : "var(--c-text)" }}>{p.stock}</td>
                  <td>
                    {p.status === "out" ? <span className="tt-badge tt-badge-danger">Out</span>
                      : p.low ? <span className="tt-badge tt-badge-warn">Low</span>
                      : <span className="tt-badge tt-badge-success">Active</span>}
                  </td>
                  <td><button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconMore size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <div className="tt-muted">Showing 1–10 of 1,248 products</div>
            <div className="tt-flex" style={{ gap: 6 }}>
              <button className="tt-btn tt-btn-secondary tt-btn-sm">Previous</button>
              <button className="tt-btn tt-btn-secondary tt-btn-sm">1</button>
              <button className="tt-btn tt-btn-primary tt-btn-sm">2</button>
              <button className="tt-btn tt-btn-secondary tt-btn-sm">3</button>
              <button className="tt-btn tt-btn-secondary tt-btn-sm">Next</button>
            </div>
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

function Inventory(props) {
  return (
    <AppScreen {...props} role="business_owner" active="inventory"
      title="Inventory"
      subtitle="Stock levels & movement history"
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconRefresh size={14} /> Adjust</button>
        <button className="tt-btn tt-btn-primary" onClick={() => props.onNavigate("purchase-orders")}><IconPlus size={14} /> New PO</button>
      </>}
    >
      <Page>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="SKUs tracked" value="1,248" sub="Across 3 warehouses" Icon={IconPackage} />
          <StatCard label="Inventory value" value="₦18.4M" delta="+₦2.1M" deltaDir="up" sub="Cost basis" Icon={IconDollar} />
          <StatCard label="Low stock" value="12" sub="Below reorder point" Icon={IconAlert} />
          <StatCard label="Out of stock" value="4" sub="Needs urgent restock" Icon={IconX} />
        </div>

        <div className="tt-tabs">
          <div className="tt-tab" data-active="true">Stock levels</div>
          <div className="tt-tab">Movements</div>
          <div className="tt-tab">Adjustments</div>
          <div className="tt-tab">Warehouses (3)</div>
        </div>

        <div className="tt-card" style={{ padding: 0 }}>
          <table className="tt-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Aba HQ</th>
                <th>Onitsha</th>
                <th>Kano</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Reorder at</th>
                <th>Status</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTS.slice(0, 8).map((p, i) => {
                const dist = [Math.floor(p.stock * 0.6), Math.floor(p.stock * 0.3), p.stock - Math.floor(p.stock * 0.6) - Math.floor(p.stock * 0.3)];
                return (
                  <tr key={p.sku}>
                    <td style={{ fontWeight: 550 }}>{p.name}</td>
                    <td className="tt-mono tt-faint">{p.sku}</td>
                    <td className="tt-mono tt-tabular">{dist[0]}</td>
                    <td className="tt-mono tt-tabular">{dist[1]}</td>
                    <td className="tt-mono tt-tabular">{dist[2]}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 600 }}>{p.stock}</td>
                    <td className="tt-mono tt-tabular tt-muted" style={{ textAlign: "right" }}>{[20, 25, 30, 15][i % 4]}</td>
                    <td>{p.status === "out" ? <span className="tt-badge tt-badge-danger">Out</span> : p.low ? <span className="tt-badge tt-badge-warn">Low</span> : <span className="tt-badge tt-badge-success">OK</span>}</td>
                    <td><div className="tt-flex" style={{ gap: 4 }}>
                      <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm" title="Adjust"><IconEdit size={13} /></button>
                      <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm" title="Transfer"><IconTransfer size={13} /></button>
                      <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm" title="History"><IconHistory size={13} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Page>
    </AppScreen>
  );
}

function PurchaseOrders(props) {
  const orders = [
    { id: "PO-00124", supplier: "Dangote Foods", items: 4, total: 1250000, date: "24 Aug 2026", eta: "27 Aug", status: "receiving" },
    { id: "PO-00123", supplier: "Nigerian Bottling Co.", items: 8, total: 640000, date: "22 Aug 2026", eta: "26 Aug", status: "sent" },
    { id: "PO-00122", supplier: "Golden Penny", items: 3, total: 380000, date: "20 Aug 2026", eta: "25 Aug", status: "received" },
    { id: "PO-00121", supplier: "Peak Milk Nigeria", items: 6, total: 480000, date: "18 Aug 2026", eta: "22 Aug", status: "received" },
    { id: "PO-00120", supplier: "Cadbury Nigeria", items: 2, total: 210000, date: "17 Aug 2026", eta: "24 Aug", status: "draft" },
  ];
  const badge = (s) => ({
    draft: <span className="tt-badge tt-badge-neutral">Draft</span>,
    sent: <span className="tt-badge tt-badge-info">Sent</span>,
    receiving: <span className="tt-badge tt-badge-warn">Receiving</span>,
    received: <span className="tt-badge tt-badge-success">Received</span>,
  }[s]);
  return (
    <AppScreen {...props} role="business_owner" active="purchase-orders"
      title="Purchase Orders"
      subtitle="Create, send, and receive orders from your suppliers"
      breadcrumb={["Inventory", "Purchase Orders"]}
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconExport size={14} /> Export</button>
        <button className="tt-btn tt-btn-primary" onClick={() => props.onNavigate("po-create")}><IconPlus size={14} /> New PO</button>
      </>}
    >
      <Page>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Open POs" value="7" sub="₦2.4M committed" Icon={IconClipboard} />
          <StatCard label="Received this month" value="18" delta="+22%" deltaDir="up" Icon={IconCheckCircle} />
          <StatCard label="Avg. lead time" value="4.2d" delta="-0.8d" deltaDir="up" sub="vs last month" Icon={IconHistory} />
          <StatCard label="Top supplier" value="Dangote Foods" sub="₦4.8M this quarter" Icon={IconBuilding} />
        </div>

        <div className="tt-flex" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="tt-seg">
            <div className="tt-seg-item" data-active="true">All (28)</div>
            <div className="tt-seg-item">Draft (3)</div>
            <div className="tt-seg-item">Sent (4)</div>
            <div className="tt-seg-item">Receiving (3)</div>
            <div className="tt-seg-item">Received (18)</div>
          </div>
          <div className="tt-flex">
            <div style={{ position: "relative", width: 240 }}>
              <IconSearch size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input className="tt-input" style={{ paddingLeft: 34 }} placeholder="Search PO or supplier" />
            </div>
          </div>
        </div>

        <div className="tt-card" style={{ padding: 0 }}>
          <table className="tt-table">
            <thead>
              <tr>
                <th>PO #</th>
                <th>Supplier</th>
                <th>Items</th>
                <th>Created</th>
                <th>Expected</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="tt-mono" style={{ fontWeight: 600 }}>{o.id}</td>
                  <td>{o.supplier}</td>
                  <td>{o.items}</td>
                  <td className="tt-muted">{o.date}</td>
                  <td className="tt-muted">{o.eta}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 600 }}>₦{o.total.toLocaleString()}</td>
                  <td>{badge(o.status)}</td>
                  <td><button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconChevronRight size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </AppScreen>
  );
}

/* Full PO creation screen — 3-step wizard preview */
function POCreate(props) {
  return (
    <AppScreen {...props} role="business_owner" active="purchase-orders"
      title="Create purchase order"
      subtitle="Step 2 of 3 · Line items"
      breadcrumb={["Purchase Orders", "PO-00125"]}
      actions={<>
        <button className="tt-btn tt-btn-ghost" onClick={() => props.onNavigate("purchase-orders")}>Cancel</button>
        <button className="tt-btn tt-btn-secondary">Save draft</button>
        <button className="tt-btn tt-btn-primary">Send to supplier <IconArrowRight size={14} /></button>
      </>}
    >
      <Page>
        {/* Steps */}
        <div className="tt-card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {[
              { n: 1, l: "Supplier & warehouse", done: true },
              { n: 2, l: "Line items", active: true },
              { n: 3, l: "Review & send" },
            ].map((s, i) => (
              <React.Fragment key={s.n}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: s.active ? "var(--c-primary)" : s.done ? "var(--c-success)" : "var(--c-surfaceAlt)", color: s.active || s.done ? "var(--c-primaryFg)" : "var(--c-textMuted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                    {s.done ? <IconCheck size={14} /> : s.n}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: s.active ? 600 : 500, color: s.active ? "var(--c-text)" : "var(--c-textMuted)" }}>{s.l}</div>
                </div>
                {i < 2 && <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="tt-grid" style={{ gridTemplateColumns: "2fr 1fr" }}>
          <div className="tt-card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div className="tt-section-title" style={{ fontSize: 18 }}>Line items</div>
              <button className="tt-btn tt-btn-secondary tt-btn-sm"><IconPlus size={13} /> Add product</button>
            </div>
            <table className="tt-table">
              <thead>
                <tr><th>Product</th><th style={{ width: 90, textAlign: "right" }}>Cost</th><th style={{ width: 100, textAlign: "right" }}>Qty</th><th style={{ width: 120, textAlign: "right" }}>Line total</th><th style={{ width: 40 }}></th></tr>
              </thead>
              <tbody>
                {[
                  { n: "Rice Mama Gold 25kg", c: 38000, q: 20 },
                  { n: "Peak Milk 400g", c: 2600, q: 100 },
                  { n: "Indomie Chicken 70g", c: 180, q: 500 },
                  { n: "Milo Refill 400g", c: 2900, q: 50 },
                ].map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 550 }}>{r.n}</td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>₦{r.c.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}><input className="tt-input" style={{ width: 80, textAlign: "right", height: 32 }} defaultValue={r.q} /></td>
                    <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 600 }}>₦{(r.c * r.q).toLocaleString()}</td>
                    <td><button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconTrash size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tt-flex-col">
            <div className="tt-card">
              <div className="tt-section-title" style={{ fontSize: 16, marginBottom: 14 }}>Order summary</div>
              {[
                ["Supplier", "Dangote Foods"],
                ["Warehouse", "Aba HQ"],
                ["Expected", "27 Aug 2026"],
                ["Payment terms", "Net 30"],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                  <span className="tt-muted">{l}</span><span style={{ fontWeight: 550 }}>{v}</span>
                </div>
              ))}
              <div style={{ height: 1, background: "var(--c-border)", margin: "10px 0" }} />
              {[
                ["Subtotal", "₦1,105,000"],
                ["Tax", "₦82,875"],
                ["Shipping", "₦25,000"],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                  <span className="tt-muted">{l}</span><span className="tt-mono tt-tabular">{v}</span>
                </div>
              ))}
              <div style={{ height: 1, background: "var(--c-border)", margin: "10px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 600 }}>Total</span>
                <span className="tt-head" style={{ fontSize: 24 }}>₦1,212,875</span>
              </div>
            </div>

            <div className="tt-card-flat" style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <IconInfo size={16} className="tt-muted" style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Business plan feature</div>
                  <div className="tt-muted" style={{ fontSize: 12 }}>POs are all-or-nothing on receipt. Partial receiving arrives Q4 2026.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

/* Transfers */
function Transfers(props) {
  const transfers = [
    { id: "TR-00089", from: "Aba HQ", to: "Onitsha", items: 3, status: "in-transit", date: "24 Aug 2026" },
    { id: "TR-00088", from: "Aba HQ", to: "Kano", items: 8, status: "completed", date: "22 Aug 2026" },
    { id: "TR-00087", from: "Onitsha", to: "Aba HQ", items: 2, status: "completed", date: "21 Aug 2026" },
    { id: "TR-00086", from: "Kano", to: "Onitsha", items: 5, status: "completed", date: "20 Aug 2026" },
  ];
  return (
    <AppScreen {...props} role="business_owner" active="transfers" title="Warehouse Transfers" subtitle="Move stock between your locations"
      actions={<button className="tt-btn tt-btn-primary"><IconPlus size={14} /> New transfer</button>}
    >
      <Page>
        <div className="tt-grid tt-grid-3" style={{ marginBottom: 20 }}>
          <StatCard label="In transit" value="3" sub="From Aba HQ" Icon={IconTransfer} />
          <StatCard label="Completed this month" value="24" delta="+6" deltaDir="up" Icon={IconCheckCircle} />
          <StatCard label="Avg. transfer time" value="1.8d" sub="Aba → Onitsha route" Icon={IconHistory} />
        </div>
        <div className="tt-card" style={{ padding: 0 }}>
          <table className="tt-table">
            <thead>
              <tr><th>Transfer #</th><th>From</th><th>To</th><th>Items</th><th>Date</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <tr key={t.id}>
                  <td className="tt-mono" style={{ fontWeight: 600 }}>{t.id}</td>
                  <td>{t.from}</td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 6 }}><IconArrowRight size={12} className="tt-muted" /> {t.to}</div></td>
                  <td>{t.items}</td>
                  <td className="tt-muted">{t.date}</td>
                  <td>{t.status === "in-transit" ? <span className="tt-badge tt-badge-warn">In transit</span> : <span className="tt-badge tt-badge-success">Completed</span>}</td>
                  <td><button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconMore size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </AppScreen>
  );
}

/* Vendors */
function Vendors(props) {
  const vendors = [
    { name: "Dangote Foods", contact: "sales@dangote.com", items: 24, owed: 1250000, rating: 4.8 },
    { name: "Nigerian Bottling Co.", contact: "orders@nbc.ng", items: 18, owed: 640000, rating: 4.9 },
    { name: "Peak Milk Nigeria", contact: "b2b@peakmilk.ng", items: 12, owed: 0, rating: 4.7 },
    { name: "Golden Penny", contact: "trade@goldenpenny.ng", items: 8, owed: 380000, rating: 4.5 },
    { name: "Cadbury Nigeria", contact: "wholesale@cadbury.ng", items: 6, owed: 210000, rating: 4.6 },
  ];
  return (
    <AppScreen {...props} role="business_owner" active="vendors" title="Vendors & Suppliers" subtitle="Consignment tracking and supplier relations"
      actions={<button className="tt-btn tt-btn-primary"><IconPlus size={14} /> Add vendor</button>}
    >
      <Page>
        <div className="tt-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {vendors.map((v) => (
            <div key={v.name} className="tt-card" style={{ padding: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                <div className="tt-avatar" style={{ background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)", width: 44, height: 44, fontSize: 16 }}>{v.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{v.name}</div>
                  <div className="tt-muted" style={{ fontSize: 12 }}>{v.contact}</div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <IconStar size={12} style={{ color: "var(--c-accent)", fill: "var(--c-accent)" }} />
                    <span style={{ fontSize: 12, fontWeight: 550 }}>{v.rating}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <div className="tt-card-flat" style={{ padding: 10 }}>
                  <div className="tt-muted" style={{ fontSize: 11 }}>Items on consignment</div>
                  <div className="tt-head" style={{ fontSize: 20, marginTop: 2 }}>{v.items}</div>
                </div>
                <div className="tt-card-flat" style={{ padding: 10 }}>
                  <div className="tt-muted" style={{ fontSize: 11 }}>Amount owed</div>
                  <div className="tt-head" style={{ fontSize: 20, marginTop: 2, color: v.owed > 0 ? "var(--c-danger)" : "var(--c-success)" }}>₦{(v.owed / 1000).toFixed(0)}k</div>
                </div>
              </div>
              <div className="tt-flex">
                <button className="tt-btn tt-btn-secondary" style={{ flex: 1 }}>View orders</button>
                <button className="tt-btn tt-btn-primary" style={{ flex: 1 }}>Pay ₦{(v.owed / 1000).toFixed(0)}k</button>
              </div>
            </div>
          ))}
        </div>
      </Page>
    </AppScreen>
  );
}

/* Sales history */
function Sales(props) {
  const sales = [
    { id: "S-A00248", cashier: "Chika", items: 4, sub: 14000, disc: 500, tax: 1050, total: 14550, method: "Cash", time: "10:42 AM", date: "24 Aug 2026" },
    { id: "S-A00247", cashier: "Chika", items: 12, sub: 45000, disc: 0, tax: 3375, total: 48375, method: "Transfer", time: "10:36 AM", date: "24 Aug 2026" },
    { id: "S-A00246", cashier: "Bola", items: 2, sub: 3600, disc: 0, tax: 270, total: 3870, method: "Cash", time: "10:30 AM", date: "24 Aug 2026" },
    { id: "S-A00245", cashier: "Chika", items: 8, sub: 21200, disc: 200, tax: 1575, total: 22575, method: "POS", time: "10:24 AM", date: "24 Aug 2026" },
    { id: "S-A00244", cashier: "Bola", items: 1, sub: 950, disc: 0, tax: 71, total: 1021, method: "Cash", time: "10:18 AM", date: "24 Aug 2026" },
    { id: "S-A00243", cashier: "Chika", items: 6, sub: 12000, disc: 1000, tax: 825, total: 11825, method: "Split", time: "10:12 AM", date: "24 Aug 2026" },
  ];
  return (
    <AppScreen {...props} role="business_owner" active="sales" title="Sales History" subtitle="Every transaction, every receipt"
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconExport size={14} /> Export</button>
        <button className="tt-btn tt-btn-primary" onClick={() => props.onNavigate("pos")}>Open POS <IconArrowRight size={14} /></button>
      </>}
    >
      <Page>
        <div className="tt-flex" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="tt-flex">
            <div style={{ position: "relative", width: 240 }}>
              <IconSearch size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input className="tt-input" style={{ paddingLeft: 34 }} placeholder="Receipt # or customer" />
            </div>
            <button className="tt-btn tt-btn-secondary">All cashiers</button>
            <button className="tt-btn tt-btn-secondary">All methods</button>
            <button className="tt-btn tt-btn-secondary">Today</button>
          </div>
        </div>

        <div className="tt-card" style={{ padding: 0 }}>
          <table className="tt-table">
            <thead>
              <tr><th>Receipt</th><th>Cashier</th><th>Items</th><th style={{ textAlign: "right" }}>Subtotal</th><th style={{ textAlign: "right" }}>Discount</th><th style={{ textAlign: "right" }}>VAT</th><th style={{ textAlign: "right" }}>Total</th><th>Method</th><th>Time</th><th></th></tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="tt-mono" style={{ fontWeight: 600 }}>{s.id}</td>
                  <td>{s.cashier}</td>
                  <td>{s.items}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>₦{s.sub.toLocaleString()}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right", color: s.disc > 0 ? "var(--c-success)" : "var(--c-textFaint)" }}>{s.disc > 0 ? `−₦${s.disc.toLocaleString()}` : "—"}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>₦{s.tax.toLocaleString()}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 700 }}>₦{s.total.toLocaleString()}</td>
                  <td><span className="tt-badge tt-badge-neutral">{s.method}</span></td>
                  <td className="tt-muted" style={{ fontSize: 12 }}>{s.time}</td>
                  <td><button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm" onClick={() => props.onNavigate("pos-receipt")}><IconEye size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </AppScreen>
  );
}

/* Reports — dense mode */
function Reports(props) {
  return (
    <AppScreen {...props} role="business_owner" active="reports" title="Reports" subtitle="Sales, inventory, purchases and audits — export anywhere"
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconPrinter size={14} /> Print</button>
        <button className="tt-btn tt-btn-secondary"><IconExport size={14} /> Excel</button>
        <button className="tt-btn tt-btn-primary"><IconDownload size={14} /> PDF</button>
      </>}
    >
      <Page>
        <div data-dense-mode="true">
        <div className="tt-flex" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="tt-seg">
            <div className="tt-seg-item">Daily</div>
            <div className="tt-seg-item">Weekly</div>
            <div className="tt-seg-item" data-active="true">Monthly</div>
            <div className="tt-seg-item">Quarterly</div>
            <div className="tt-seg-item">Yearly</div>
            <div className="tt-seg-item">Custom…</div>
          </div>
          <div className="tt-flex">
            <button className="tt-btn tt-btn-secondary">August 2026</button>
            <button className="tt-btn tt-btn-secondary">All shops</button>
          </div>
        </div>

        <div className="tt-grid tt-grid-4" style={{ marginBottom: 16 }}>
          <StatCard label="Revenue" value="₦8,240,180" delta="+22%" deltaDir="up" sub="vs. July" Icon={IconDollar} />
          <StatCard label="Transactions" value="2,847" delta="+15%" deltaDir="up" Icon={IconCart} />
          <StatCard label="Gross profit" value="₦2,110,540" delta="+18%" deltaDir="up" sub="25.6% margin" Icon={IconTrending} />
          <StatCard label="Refunds" value="₦48,200" delta="+3%" deltaDir="down" Icon={IconRefresh} />
        </div>

        <div className="tt-grid" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 16 }}>
          <div className="tt-card">
            <div className="tt-section-title" style={{ fontSize: 16, marginBottom: 14 }}>Revenue by day · August 2026</div>
            <SalesChart />
          </div>
          <div className="tt-card">
            <div className="tt-section-title" style={{ fontSize: 16, marginBottom: 14 }}>Revenue by category</div>
            {[
              { c: "Grains", v: 3200000, p: 39 },
              { c: "Provisions", v: 2140000, p: 26 },
              { c: "Drinks", v: 1450000, p: 18 },
              { c: "Household", v: 830000, p: 10 },
              { c: "Snacks", v: 620000, p: 7 },
            ].map((r) => (
              <div key={r.c} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span>{r.c}</span>
                  <span className="tt-mono tt-tabular">₦{r.v.toLocaleString()} · {r.p}%</span>
                </div>
                <div className="tt-progress" style={{ height: 4 }}>
                  <div className="tt-progress-bar" style={{ width: `${r.p * 2.5}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tt-card" style={{ padding: 0 }}>
          <div style={{ padding: 14, borderBottom: "1px solid var(--c-border)", display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Top-selling SKUs · August 2026</div>
            <a style={{ fontSize: 12, color: "var(--c-primary)", cursor: "pointer" }}>View all 1,248</a>
          </div>
          <table className="tt-table">
            <thead>
              <tr><th>#</th><th>SKU</th><th>Product</th><th>Category</th><th style={{ textAlign: "right" }}>Units</th><th style={{ textAlign: "right" }}>Revenue</th><th style={{ textAlign: "right" }}>Margin</th><th style={{ textAlign: "right" }}>Return %</th></tr>
            </thead>
            <tbody>
              {[
                ["1", "SKU-1024", "Rice Mama Gold 25kg", "Grains", 480, 20160000, "9.5%", "0.2%"],
                ["2", "SKU-0028", "Coca-Cola 50cl", "Drinks", 3820, 955000, "20%", "0.0%"],
                ["3", "SKU-0812", "Peak Milk 400g", "Provisions", 620, 1984000, "18.7%", "0.5%"],
                ["4", "SKU-0119", "Indomie Chicken 70g", "Snacks", 2840, 710000, "28%", "0.1%"],
                ["5", "SKU-0512", "Ariel Detergent 900g", "Household", 380, 798000, "16.6%", "0.3%"],
                ["6", "SKU-0619", "Milo Refill 400g", "Provisions", 260, 910000, "17.1%", "0.2%"],
              ].map((r) => (
                <tr key={r[0]}>
                  <td className="tt-mono tt-faint">{r[0]}</td>
                  <td className="tt-mono tt-faint">{r[1]}</td>
                  <td style={{ fontWeight: 550 }}>{r[2]}</td>
                  <td className="tt-muted">{r[3]}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>{r[4].toLocaleString()}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 600 }}>₦{r[5].toLocaleString()}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right", color: "var(--c-success)" }}>{r[6]}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>{r[7]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </Page>
    </AppScreen>
  );
}

/* Audit trail */
function Audit(props) {
  const events = [
    { who: "Amaka Onyeka", role: "business_owner", act: "updated price", ent: "Rice Mama Gold 25kg", diff: "₦41,500 → ₦42,000", time: "5m ago", sev: "info" },
    { who: "Chika Eze", role: "cashier", act: "voided sale", ent: "Receipt S-A00241", diff: "Reason: wrong customer", time: "22m ago", sev: "warn" },
    { who: "System", role: "system", act: "auto-received", ent: "PO-00122 from Golden Penny", diff: "Inventory updated · 3 SKUs", time: "1h ago", sev: "info" },
    { who: "Amaka Onyeka", role: "business_owner", act: "changed role", ent: "Bola Adekunle", diff: "cashier → admin", time: "3h ago", sev: "warn" },
    { who: "System", role: "system", act: "sync completed", ent: "18 offline sales", diff: "All merged, 0 conflicts", time: "5h ago", sev: "info" },
    { who: "Ibrahim Musa", role: "admin", act: "deleted product", ent: "SKU-0891 · Test soap", diff: "Not sold in 90 days", time: "1d ago", sev: "danger" },
    { who: "Zainpay webhook", role: "system", act: "credited subscription", ent: "Growth plan · ₦7,500", diff: "NUBAN 0912344***", time: "1d ago", sev: "info" },
  ];
  return (
    <AppScreen {...props} role="business_owner" active="audit" title="Audit Trail" subtitle="Immutable record of every change in your shop"
      actions={<><button className="tt-btn tt-btn-secondary"><IconExport size={14} /> Export</button></>}
    >
      <Page>
        <div className="tt-flex" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="tt-flex">
            <div style={{ position: "relative", width: 300 }}>
              <IconSearch size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input className="tt-input" style={{ paddingLeft: 34 }} placeholder="User, action, or entity…" />
            </div>
            <button className="tt-btn tt-btn-secondary">All actions</button>
            <button className="tt-btn tt-btn-secondary">All users</button>
            <button className="tt-btn tt-btn-secondary">Last 24h</button>
          </div>
        </div>
        <div className="tt-card">
          {events.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid var(--c-border)" }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, marginTop: 8, background: e.sev === "warn" ? "var(--c-warn)" : e.sev === "danger" ? "var(--c-danger)" : "var(--c-info)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{e.who}</span>
                  <span className="tt-muted"> · {e.role.replace("_", " ")}</span>
                  <span style={{ margin: "0 8px", color: "var(--c-textFaint)" }}>·</span>
                  <span>{e.act} <b>{e.ent}</b></span>
                </div>
                <div className="tt-mono tt-muted" style={{ fontSize: 11, marginTop: 4 }}>{e.diff}</div>
              </div>
              <div className="tt-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{e.time}</div>
            </div>
          ))}
        </div>
      </Page>
    </AppScreen>
  );
}

/* Notifications */
function Notifications(props) {
  const notifs = [
    { t: "PO-00122 from Golden Penny fully received", d: "Inventory automatically updated. 3 SKUs, ₦380,000.", time: "12m ago", type: "success", unread: true },
    { t: "Low stock: 4 SKUs below reorder point", d: "Peak Milk 400g, Indomie Chicken, Coca-Cola 50cl, Golden Penny Semo", time: "1h ago", type: "warn", unread: true },
    { t: "New subscription payment received", d: "Growth plan · ₦7,500 · Zainpay reference ZP-8734921", time: "2h ago", type: "info", unread: true },
    { t: "18 offline sales synced successfully", d: "Aba HQ terminal · 0 conflicts", time: "5h ago", type: "success", unread: false },
    { t: "Bola Adekunle changed to Admin", d: "Role change confirmed by business owner", time: "6h ago", type: "info", unread: false },
    { t: "Weekly report ready", d: "August week 4 · Sales report generated · 8 pages", time: "1d ago", type: "info", unread: false },
  ];
  return (
    <AppScreen {...props} role="business_owner" active="notifications" title="Notifications" subtitle="Everything that happened in your shop, in one place"
      actions={<>
        <button className="tt-btn tt-btn-secondary">Mark all read</button>
        <button className="tt-btn tt-btn-secondary">Filters</button>
      </>}
    >
      <Page>
        <div className="tt-tabs">
          <div className="tt-tab" data-active="true">All (24)</div>
          <div className="tt-tab">Unread (3)</div>
          <div className="tt-tab">Inventory (12)</div>
          <div className="tt-tab">Sales (8)</div>
          <div className="tt-tab">Payments (4)</div>
        </div>
        <div className="tt-card" style={{ padding: 0 }}>
          {notifs.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 14, padding: 20, borderBottom: i === notifs.length - 1 ? "none" : "1px solid var(--c-border)", background: n.unread ? "color-mix(in oklch, var(--c-primary), transparent 96%)" : "transparent" }}>
              <div style={{ width: 40, height: 40, borderRadius: "var(--radius)", background: `color-mix(in oklch, var(--c-${n.type}), transparent 85%)`, color: `var(--c-${n.type})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {n.type === "success" ? <IconCheckCircle size={18} /> : n.type === "warn" ? <IconAlert size={18} /> : <IconInfo size={18} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{n.t}</div>
                  {n.unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--c-primary)", marginTop: 6 }} />}
                </div>
                <div className="tt-muted" style={{ fontSize: 13, marginTop: 4 }}>{n.d}</div>
                <div className="tt-faint" style={{ fontSize: 11, marginTop: 6 }}>{n.time}</div>
              </div>
            </div>
          ))}
        </div>
      </Page>
    </AppScreen>
  );
}

Object.assign(window, { Products, Inventory, PurchaseOrders, POCreate, Transfers, Vendors, Sales, Reports, Audit, Notifications });
