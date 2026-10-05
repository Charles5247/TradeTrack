/* Missing screens filled in using the templates: Warehouses, Receipt Lookup,
 * Sales detail, Merchant detail, Product Edit form, User Invite modal, PO detail. */

/* ─── Warehouses list ─── */
function Warehouses(props) {
  const warehouses = [
    { name: "Aba HQ", loc: "18 Market Rd, Aba", skus: 812, value: 12400000, low: 8, occupancy: 78, status: "active" },
    { name: "Onitsha Depot", loc: "Bridgehead, Onitsha", skus: 348, value: 4200000, low: 3, occupancy: 62, status: "active" },
    { name: "Kano Warehouse", loc: "Sabon Gari, Kano", skus: 88, value: 1800000, low: 1, occupancy: 34, status: "active" },
  ];
  return (
    <AppScreen {...props} role="business_owner" active="warehouses" title="Warehouses" subtitle="3 locations · 1,248 SKUs · ₦18.4M inventory value"
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconMap size={14} /> Map view</button>
        <button className="tt-btn tt-btn-primary"><IconPlus size={14} /> Add warehouse</button>
      </>}
    >
      <Page>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Total warehouses" value="3" sub="All active" Icon={IconWarehouse} />
          <StatCard label="Total SKUs stored" value="1,248" delta="+42" deltaDir="up" Icon={IconPackage} />
          <StatCard label="Inventory value" value="₦18.4M" delta="+₦2.1M" deltaDir="up" sub="Cost basis" Icon={IconDollar} />
          <StatCard label="Low-stock alerts" value="12" sub="Across all" Icon={IconAlert} />
        </div>

        <div className="tt-grid tt-grid-3">
          {warehouses.map((w) => (
            <div key={w.name} className="tt-card" style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div className="tt-head" style={{ fontSize: 20 }}>{w.name}</div>
                  <div className="tt-muted" style={{ fontSize: 12, marginTop: 4 }}>{w.loc}</div>
                </div>
                <span className="tt-badge tt-badge-success">Active</span>
              </div>
              <div className="tt-grid tt-grid-2" style={{ gap: 8, marginBottom: 16 }}>
                <div className="tt-card-flat" style={{ padding: 12 }}>
                  <div className="tt-muted" style={{ fontSize: 11 }}>SKUs</div>
                  <div className="tt-head" style={{ fontSize: 20 }}>{w.skus}</div>
                </div>
                <div className="tt-card-flat" style={{ padding: 12 }}>
                  <div className="tt-muted" style={{ fontSize: 11 }}>Value</div>
                  <div className="tt-head" style={{ fontSize: 20 }}>₦{(w.value / 1_000_000).toFixed(1)}M</div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                  <span className="tt-muted">Capacity</span>
                  <span className="tt-mono">{w.occupancy}%</span>
                </div>
                <div className="tt-progress" style={{ height: 4 }}>
                  <div className="tt-progress-bar" style={{ width: `${w.occupancy}%` }} />
                </div>
              </div>
              <div className="tt-flex">
                <button className="tt-btn tt-btn-secondary" style={{ flex: 1 }} onClick={() => props.onNavigate("inventory")}>View inventory</button>
                <button className="tt-btn tt-btn-ghost tt-btn-icon"><IconMore size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </Page>
    </AppScreen>
  );
}

/* ─── Receipt lookup ─── */
function ReceiptLookup(props) {
  return (
    <AppScreen {...props} role="business_owner" active="receipts" title="Receipt Lookup" subtitle="Find any receipt by number, barcode, or QR"
      breadcrumb={["Operate", "Receipt Lookup"]}
    >
      <Page>
        <div className="tt-grid" style={{ gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
          <div>
            <div className="tt-card" style={{ padding: 32 }}>
              <div className="tt-eyebrow" style={{ marginBottom: 16 }}>Look up a receipt</div>
              <div className="tt-flex" style={{ marginBottom: 12 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <IconSearch size={16} className="tt-muted" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
                  <input className="tt-input" style={{ paddingLeft: 40, height: 48, fontSize: 15 }} placeholder="Receipt # (e.g. A00248)" defaultValue="A00248" />
                </div>
                <button className="tt-btn tt-btn-primary tt-btn-lg">Look up</button>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
                <span className="tt-muted" style={{ fontSize: 11 }}>OR</span>
                <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
              </div>
              <div className="tt-flex">
                <button className="tt-btn tt-btn-secondary" style={{ flex: 1, height: 48 }}><IconBarcode size={16} /> Scan barcode</button>
                <button className="tt-btn tt-btn-secondary" style={{ flex: 1, height: 48 }}><IconLayers size={16} /> Scan QR</button>
              </div>
            </div>

            <div className="tt-card" style={{ padding: 24, marginTop: 20 }}>
              <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Recent lookups</div>
              {["A00248", "A00245", "A00241", "A00239", "A00234"].map((r) => (
                <div key={r} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px dashed var(--c-border)", fontSize: 13 }}>
                  <span className="tt-mono" style={{ fontWeight: 600 }}>{r}</span>
                  <span className="tt-muted">Looked up 12m ago · by Chika</span>
                  <a style={{ color: "var(--c-primary)", cursor: "pointer" }}>Open</a>
                </div>
              ))}
            </div>
          </div>

          <div className="tt-card" style={{ padding: 20 }}>
            <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Preview · A00248</div>
            <div className="tt-receipt">
              <div style={{ textAlign: "center", fontWeight: 700, letterSpacing: 1 }}>ONYEKA PROVISION STORES</div>
              <div style={{ textAlign: "center", fontSize: 10, marginTop: 4 }}>18 Market Rd, Aba</div>
              <div style={{ textAlign: "center", opacity: 0.6, margin: "6px 0" }}>********************************</div>
              <div style={{ fontSize: 11 }}>Receipt: <b>A00248</b> · Chika · 10:42 AM</div>
              <div style={{ textAlign: "center", opacity: 0.6, margin: "6px 0" }}>********************************</div>
              {[["Rice Mama Gold 25kg", 42000], ["Peak Milk ×3", 9600], ["Indomie ×12", 3000]].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span>{r[0]}</span><span className="tt-tabular">₦{r[1].toLocaleString()}</span>
                </div>
              ))}
              <div style={{ textAlign: "center", opacity: 0.6, margin: "6px 0" }}>********************************</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                <span>TOTAL</span><span className="tt-tabular">₦62,775</span>
              </div>
            </div>
            <button className="tt-btn tt-btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => props.onNavigate("pos-receipt")}>Open full receipt <IconArrowRight size={14} /></button>
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

/* ─── Sale detail ─── */
function SaleDetail(props) {
  return (
    <AppScreen {...props} role="business_owner" active="sales" title="Receipt A00248"
      breadcrumb={["Operate", "Sales history", "A00248"]}
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconPrinter size={14} /> Reprint</button>
        <button className="tt-btn tt-btn-secondary"><IconMail size={14} /> Email</button>
        <button className="tt-btn tt-btn-danger">Void sale</button>
      </>}
    >
      <Page>
        <DetailTemplate
          title="Receipt A00248"
          subtitle="Sold by Chika · 24 Aug 2026 · 10:42 AM"
          statusBadge={<span className="tt-badge tt-badge-success"><IconCheck size={11} /> Complete</span>}
          meta={[
            { label: "Total", value: "₦62,775" },
            { label: "Method", value: "Cash" },
            { label: "Change", value: "₦7,225" },
            { label: "Items", value: "22" },
          ]}
          mainContent={
            <div className="tt-card" style={{ padding: 0 }}>
              <div style={{ padding: 20, borderBottom: "1px solid var(--c-border)", display: "flex", justifyContent: "space-between" }}>
                <div className="tt-section-title" style={{ fontSize: 16 }}>Line items</div>
                <div className="tt-muted" style={{ fontSize: 12 }}>4 products · 22 units</div>
              </div>
              <table className="tt-table">
                <thead>
                  <tr><th>Product</th><th>SKU</th><th style={{ textAlign: "right" }}>Unit price</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Total</th></tr>
                </thead>
                <tbody>
                  {[
                    ["Rice Mama Gold 25kg", "SKU-1024", 42000, 1],
                    ["Peak Milk 400g", "SKU-0812", 3200, 3],
                    ["Indomie Chicken 70g", "SKU-0119", 250, 12],
                    ["Coca-Cola 50cl", "SKU-0028", 250, 6],
                  ].map((r) => (
                    <tr key={r[1]}>
                      <td style={{ fontWeight: 550 }}>{r[0]}</td>
                      <td className="tt-mono tt-faint">{r[1]}</td>
                      <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>₦{r[2].toLocaleString()}</td>
                      <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>{r[3]}</td>
                      <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 600 }}>₦{(r[2] * r[3]).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: 20, background: "var(--c-surfaceAlt)", display: "grid", gridTemplateColumns: "1fr 240px", gap: 20 }}>
                <div />
                <div>
                  {[["Subtotal", "₦58,860"], ["Discount", "−₦500"], ["VAT 7.5%", "₦4,415"]].map((r) => (
                    <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                      <span className="tt-muted">{r[0]}</span>
                      <span className="tt-mono tt-tabular">{r[1]}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", marginTop: 6, borderTop: "2px solid var(--c-border)" }}>
                    <span style={{ fontWeight: 700 }}>Total</span>
                    <span className="tt-head" style={{ fontSize: 20 }}>₦62,775</span>
                  </div>
                </div>
              </div>
            </div>
          }
          sideContent={
            <div className="tt-flex-col">
              <div className="tt-card">
                <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Payment details</div>
                {[["Method", "Cash"], ["Amount tendered", "₦70,000"], ["Change given", "₦7,225"]].map((r) => (
                  <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                    <span className="tt-muted">{r[0]}</span>
                    <span className="tt-mono">{r[1]}</span>
                  </div>
                ))}
              </div>
              <div className="tt-card">
                <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Timeline</div>
                {[
                  { t: "10:42 AM", e: "Sale completed", who: "Chika" },
                  { t: "10:42 AM", e: "Cash tendered ₦70,000", who: "Chika" },
                  { t: "10:41 AM", e: "Discount ₦500 applied", who: "Chika" },
                  { t: "10:39 AM", e: "Sale started", who: "Chika" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: i === 3 ? "none" : "1px dashed var(--c-border)" }}>
                    <div className="tt-mono tt-muted" style={{ fontSize: 11, width: 60 }}>{r.t}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 550 }}>{r.e}</div>
                      <div className="tt-muted" style={{ fontSize: 10 }}>{r.who}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          }
        />
      </Page>
    </AppScreen>
  );
}

/* ─── Merchant detail (Platform Owner) ─── */
function MerchantDetail(props) {
  return (
    <AppScreen {...props} role="platform_owner" active="merchants"
      userRole="platform_owner" orgName="TradeTrack Platform" userName="Charles"
      title="Onyeka Provision Stores"
      breadcrumb={["Platform", "Merchants", "Onyeka Provision Stores"]}
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconEye size={14} /> Impersonate</button>
        <button className="tt-btn tt-btn-secondary"><IconMail size={14} /> Contact owner</button>
        <button className="tt-btn tt-btn-danger">Suspend</button>
      </>}
    >
      <Page>
        <DetailTemplate
          title="Onyeka Provision Stores"
          subtitle="Amaka Onyeka · 18 Market Rd, Aba, Abia State"
          statusBadge={<span className="tt-badge tt-badge-success">Active · Growth plan</span>}
          meta={[
            { label: "Merchant since", value: "Aug 2025 · 12mo" },
            { label: "MRR", value: "₦7,500" },
            { label: "NUBAN", value: "0912344978" },
            { label: "Users", value: "6" },
          ]}
          overviewCards={[
            { label: "GMV · 30d", value: "₦8.24M", delta: "+18%", deltaDir: "up", Icon: IconTrending },
            { label: "Transactions · 30d", value: "2,847", delta: "+15%", deltaDir: "up", Icon: IconCart },
            { label: "SKUs tracked", value: "1,248", sub: "Across 3 shops", Icon: IconPackage },
            { label: "Sub. status", value: "Paid", sub: "Next: 1 Sep 2026", Icon: IconCard },
          ]}
          tabs={{ active: "overview", items: [
            { key: "overview", label: "Overview" },
            { key: "billing", label: "Billing" },
            { key: "users", label: "Users (6)" },
            { key: "warehouses", label: "Warehouses (3)" },
            { key: "activity", label: "Activity" },
          ]}}
          mainContent={
            <div className="tt-flex-col">
              <div className="tt-card">
                <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 14 }}>GMV trend · 12 weeks</div>
                <SalesChart />
              </div>
              <div className="tt-card">
                <div className="tt-section-title" style={{ fontSize: 16, marginBottom: 12 }}>Recent activity</div>
                {[
                  { e: "Zainpay payment received · ₦7,500", t: "1d ago", type: "success" },
                  { e: "Bola Adekunle promoted admin → cashier", t: "3d ago", type: "info" },
                  { e: "PO-00122 received · Golden Penny", t: "5d ago", type: "info" },
                  { e: "Low stock alert · 4 SKUs", t: "1w ago", type: "warn" },
                ].map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i === 3 ? "none" : "1px solid var(--c-border)" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 999, background: `var(--c-${a.type})` }} />
                    <div style={{ flex: 1, fontSize: 13 }}>{a.e}</div>
                    <div className="tt-muted" style={{ fontSize: 11 }}>{a.t}</div>
                  </div>
                ))}
              </div>
            </div>
          }
          sideContent={
            <div className="tt-flex-col">
              <div className="tt-card">
                <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Business owner</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div className="tt-avatar" style={{ width: 48, height: 48, background: "var(--c-primary)", color: "var(--c-primaryFg)", fontSize: 18 }}>A</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Amaka Onyeka</div>
                    <div className="tt-muted" style={{ fontSize: 12 }}>amaka@onyekastores.ng</div>
                  </div>
                </div>
                <button className="tt-btn tt-btn-secondary" style={{ width: "100%" }}><IconMail size={13} /> Send email</button>
              </div>
              <div className="tt-card">
                <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Zainpay account</div>
                <div style={{ fontSize: 12, color: "var(--c-textMuted)" }}>NUBAN</div>
                <div className="tt-mono" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.02em" }}>0912344978</div>
                <div style={{ fontSize: 12, color: "var(--c-textMuted)", marginTop: 12 }}>Total lifetime received</div>
                <div className="tt-head" style={{ fontSize: 22 }}>₦102,000</div>
              </div>
              <div className="tt-card">
                <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Data isolation</div>
                <div className="tt-flex" style={{ alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <IconShield size={14} style={{ color: "var(--c-success)" }} />
                  <span style={{ fontSize: 12 }}>Row-level secured · this org only</span>
                </div>
                <div className="tt-muted" style={{ fontSize: 11 }}>Platform owner cannot read this merchant's operational data (products, sales, POS). Impersonate flow is audit-logged.</div>
              </div>
            </div>
          }
        />
      </Page>
    </AppScreen>
  );
}

/* ─── Product Edit form ─── */
function ProductEdit(props) {
  return (
    <AppScreen {...props} role="business_owner" active="products"
      title="Edit product"
      subtitle="Rice Mama Gold 25kg · SKU-1024"
      breadcrumb={["Inventory", "Products", "Rice Mama Gold 25kg"]}
      actions={<>
        <button className="tt-btn tt-btn-ghost" onClick={() => props.onNavigate("products")}>Cancel</button>
        <button className="tt-btn tt-btn-secondary">Duplicate</button>
        <button className="tt-btn tt-btn-danger">Delete</button>
        <button className="tt-btn tt-btn-primary">Save changes</button>
      </>}
    >
      <Page>
        <FormTemplate
          onCancel={() => props.onNavigate("products")}
          onSave={() => props.onNavigate("products")}
          sections={[
            {
              title: "Basic info",
              description: "Shown on POS and receipts.",
              fields: (
                <>
                  <Field label="Product name"><input className="tt-input" defaultValue="Rice Mama Gold 25kg" /></Field>
                  <Field label="SKU" half><input className="tt-input tt-mono" defaultValue="SKU-1024" /></Field>
                  <Field label="Barcode" half><input className="tt-input tt-mono" defaultValue="6151101047024" /></Field>
                  <Field label="Category">
                    <select className="tt-input"><option>Grains</option><option>Provisions</option></select>
                  </Field>
                  <Field label="Description"><textarea className="tt-input" rows="3" defaultValue="Premium parboiled rice · 25kg bag" style={{ height: "auto", padding: 12 }} /></Field>
                </>
              ),
            },
            {
              title: "Pricing",
              description: "Cost is what you paid; price is what you sell for.",
              fields: (
                <>
                  <Field label="Cost price" half hint="Auto-updates from Purchase Orders">
                    <div style={{ position: "relative" }}>
                      <span className="tt-mono" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--c-textMuted)" }}>₦</span>
                      <input className="tt-input tt-mono tt-tabular" style={{ paddingLeft: 26 }} defaultValue="38,000" />
                    </div>
                  </Field>
                  <Field label="Sell price" half>
                    <div style={{ position: "relative" }}>
                      <span className="tt-mono" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--c-textMuted)" }}>₦</span>
                      <input className="tt-input tt-mono tt-tabular" style={{ paddingLeft: 26 }} defaultValue="42,000" />
                    </div>
                  </Field>
                  <div className="tt-card-flat" style={{ padding: 12, marginTop: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span className="tt-muted">Margin</span><span style={{ fontWeight: 600, color: "var(--c-success)" }}>₦4,000 · 9.5%</span>
                    </div>
                  </div>
                  <Field label="VAT" hint="Default 7.5% Nigerian VAT">
                    <select className="tt-input"><option>7.5% (standard)</option><option>0% (exempt)</option></select>
                  </Field>
                </>
              ),
            },
            {
              title: "Inventory & warehouse",
              fields: (
                <>
                  <Field label="Track inventory">
                    <div className="tt-seg">
                      <div className="tt-seg-item" data-active="true">Yes</div>
                      <div className="tt-seg-item">No (service)</div>
                    </div>
                  </Field>
                  <Field label="Reorder point" half hint="Low-stock alert triggers here">
                    <input className="tt-input tt-mono tt-tabular" defaultValue="20" />
                  </Field>
                  <Field label="Reorder qty" half>
                    <input className="tt-input tt-mono tt-tabular" defaultValue="50" />
                  </Field>
                </>
              ),
            },
          ]}
          sidebar={
            <>
              <div className="tt-card">
                <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Product image</div>
                <div className="tt-placeholder" style={{ aspectRatio: "1/1", marginBottom: 10 }}>drop image</div>
                <button className="tt-btn tt-btn-secondary" style={{ width: "100%" }}><IconUpload size={13} /> Upload</button>
              </div>
              <div className="tt-card">
                <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Live stats</div>
                {[["Total stock", "18"], ["Sold · 30d", "480"], ["Revenue · 30d", "₦20.1M"], ["Avg. daily", "16"]].map((r) => (
                  <div key={r[0]} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px dashed var(--c-border)" }}>
                    <span className="tt-muted">{r[0]}</span><span className="tt-mono">{r[1]}</span>
                  </div>
                ))}
              </div>
            </>
          }
        />
      </Page>
    </AppScreen>
  );
}

/* ─── State examples showcase (design system page addition) ─── */
function StatesExamples() {
  return (
    <div className="tt-flex-col" style={{ gap: 32 }}>
      <div>
        <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Empty state</div>
        <EmptyState
          Icon={IconPackage}
          title="No products yet"
          body="Add your first product to start selling. You can import in bulk from CSV or add one at a time."
          action={<button className="tt-btn tt-btn-primary"><IconPlus size={14} /> Add product</button>}
          secondary={<button className="tt-btn tt-btn-secondary"><IconUpload size={14} /> Import CSV</button>}
        />
      </div>
      <div>
        <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Loading state</div>
        <LoadingState rows={4} />
      </div>
      <div>
        <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Error state</div>
        <ErrorState title="Couldn't load products" body="Check your connection and try again. If the problem persists, our sync engine is queuing your work locally." onRetry={() => {}} />
      </div>
      <div>
        <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Toasts</div>
        <div className="tt-flex-col" style={{ gap: 8, alignItems: "flex-start" }}>
          <Toast type="success" title="Sale complete" body="Receipt A00248 · ₦62,775 saved and synced." />
          <Toast type="warn" title="Low stock alert" body="4 SKUs below reorder point. Consider creating a PO." />
          <Toast type="danger" title="Sync failed" body="Retrying in 30 seconds. Your work is safe locally." />
          <Toast type="info" title="New feature: Purchase Orders" body="Now available on the Business plan." />
        </div>
      </div>
      <div>
        <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Modal / Dialog</div>
        <div className="tt-card" style={{ padding: 40, position: "relative", background: "var(--c-surfaceAlt)", minHeight: 400 }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Modal
              title="Delete product?"
              subtitle="This can't be undone. Historical sales stay in the audit log."
              onClose={() => {}}
              actions={<>
                <button className="tt-btn tt-btn-ghost">Cancel</button>
                <button className="tt-btn tt-btn-danger">Delete product</button>
              </>}
            >
              <div className="tt-flex" style={{ gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 40, height: 40, borderRadius: "var(--radius)", background: "color-mix(in oklch, var(--c-danger), transparent 85%)", color: "var(--c-danger)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <IconAlert size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>You're about to delete <b>Rice Mama Gold 25kg</b> (SKU-1024).</div>
                  <div className="tt-muted" style={{ fontSize: 13 }}>This product has 480 sales in the last 30 days and 18 units in stock. Consider archiving instead if you want to keep the history but hide it from POS.</div>
                </div>
              </div>
            </Modal>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  Warehouses, ReceiptLookup, SaleDetail, MerchantDetail, ProductEdit, StatesExamples,
});
