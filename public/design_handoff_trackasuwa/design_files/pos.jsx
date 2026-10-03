/* POS — the checkout counter. Big-touch density regardless of global density setting. */

const POS_CATEGORIES = ["All", "Drinks", "Grains", "Snacks", "Toiletries", "Household", "Provisions"];
const POS_PRODUCTS = [
  { id: 1, name: "Coca-Cola 50cl", price: 250, cat: "Drinks", stock: 48 },
  { id: 2, name: "Fanta Orange 50cl", price: 250, cat: "Drinks", stock: 32 },
  { id: 3, name: "Peak Milk 400g", price: 3200, cat: "Provisions", stock: 4, low: true },
  { id: 4, name: "Indomie Chicken 70g", price: 250, cat: "Snacks", stock: 120 },
  { id: 5, name: "Rice Mama Gold 25kg", price: 42000, cat: "Grains", stock: 18 },
  { id: 6, name: "Golden Penny Semo 5kg", price: 6200, cat: "Grains", stock: 6, low: true },
  { id: 7, name: "Titus Sardine 125g", price: 950, cat: "Provisions", stock: 42 },
  { id: 8, name: "Blue Band Margarine", price: 1200, cat: "Provisions", stock: 28 },
  { id: 9, name: "Dettol Soap 175g", price: 750, cat: "Toiletries", stock: 65 },
  { id: 10, name: "Ariel Detergent 900g", price: 2100, cat: "Household", stock: 24 },
  { id: 11, name: "Milo Refill 400g", price: 3500, cat: "Provisions", stock: 22 },
  { id: 12, name: "Malta Guinness 33cl", price: 450, cat: "Drinks", stock: 60 },
];

const POS_CART = [
  { id: 5, name: "Rice Mama Gold 25kg", qty: 1, price: 42000 },
  { id: 3, name: "Peak Milk 400g", qty: 3, price: 3200 },
  { id: 4, name: "Indomie Chicken 70g", qty: 12, price: 250 },
  { id: 1, name: "Coca-Cola 50cl", qty: 6, price: 250 },
];

function POS(props) {
  const subtotal = POS_CART.reduce((s, i) => s + i.qty * i.price, 0);
  const discount = 500;
  const tax = Math.round((subtotal - discount) * 0.075);
  const total = subtotal - discount + tax;

  return (
    <div className="tt-app" data-collapsed="true" data-pos-mode="true">
      <aside className="tt-sidebar" style={{ width: 64 }}>
        <Sidebar
          role="cashier"
          active="pos"
          onNavigate={props.onNavigate}
          direction={props.direction}
          orgName={props.orgName}
          userName={props.userName}
          userRole={props.userRole}
        />
      </aside>
      <div className="tt-main" data-pos-mode="true">
        <Header
          title="Point of Sale"
          subtitle="Cashier: Chika · Terminal 02 · Aba HQ"
          actions={
            <>
              <button className="tt-btn tt-btn-secondary"><IconBarcode size={14} /> Scan</button>
              <button className="tt-btn tt-btn-danger">Clear cart</button>
            </>
          }
          mode={props.mode}
          onToggleMode={props.onToggleMode}
        />

        <div className="tt-content" style={{ padding: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20, minHeight: "calc(100vh - var(--header-h) - 40px)" }}>
            {/* Left — product grid */}
            <div className="tt-flex-col" style={{ gap: 16 }}>
              <div className="tt-card" style={{ padding: 16 }}>
                <div style={{ position: "relative", marginBottom: 14 }}>
                  <IconSearch size={16} className="tt-muted" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
                  <input className="tt-input" style={{ paddingLeft: 40, height: 52, fontSize: 16 }} placeholder="Scan barcode or search product…" />
                  <span className="tt-kbd" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>F2</span>
                </div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                  {POS_CATEGORIES.map((c) => (
                    <button key={c} className="tt-btn tt-btn-secondary" style={{ background: c === "All" ? "var(--c-primary)" : undefined, color: c === "All" ? "var(--c-primaryFg)" : undefined, borderColor: c === "All" ? "var(--c-primary)" : undefined }}>{c}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {POS_PRODUCTS.map((p) => (
                  <button key={p.id} className="tt-card" style={{ padding: 12, textAlign: "left", cursor: "pointer", position: "relative", background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
                    <div className="tt-placeholder" style={{ aspectRatio: "1 / 1", marginBottom: 10 }}>product</div>
                    <div style={{ fontSize: 13, fontWeight: 600, minHeight: 34, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{p.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                      <div className="tt-mono tt-tabular" style={{ fontSize: 15, fontWeight: 700 }}>₦{p.price.toLocaleString()}</div>
                      {p.low ? (
                        <span className="tt-badge tt-badge-warn" style={{ padding: "0 6px" }}>{p.stock} left</span>
                      ) : (
                        <span className="tt-muted" style={{ fontSize: 11 }}>{p.stock} in stock</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right — cart */}
            <div className="tt-card" style={{ padding: 0, display: "flex", flexDirection: "column", position: "sticky", top: "calc(var(--header-h) + 20px)", alignSelf: "flex-start", maxHeight: "calc(100vh - var(--header-h) - 40px)" }}>
              <div style={{ padding: 20, borderBottom: "1px solid var(--c-border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div className="tt-section-title">Current sale</div>
                  <div className="tt-badge tt-badge-primary">{POS_CART.length} items</div>
                </div>
                <div className="tt-muted" style={{ fontSize: 12, marginTop: 4 }}>Sale started 3 min ago · No customer selected</div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
                {POS_CART.map((item) => (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: "12px 8px", borderBottom: "1px solid var(--c-border)" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                      <div className="tt-mono" style={{ fontSize: 12, color: "var(--c-textMuted)", marginTop: 2 }}>₦{item.price.toLocaleString()} × {item.qty}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconMinus size={14} /></button>
                      <div className="tt-mono tt-tabular" style={{ minWidth: 24, textAlign: "center", fontWeight: 600 }}>{item.qty}</div>
                      <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconPlus size={14} /></button>
                      <div className="tt-mono tt-tabular" style={{ minWidth: 82, textAlign: "right", fontSize: 14, fontWeight: 600 }}>₦{(item.qty * item.price).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: 20, borderTop: "1px solid var(--c-border)", background: "var(--c-surfaceAlt)" }}>
                <div className="tt-flex-col" style={{ gap: 8, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span className="tt-muted">Subtotal</span>
                    <span className="tt-mono tt-tabular">₦{subtotal.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span className="tt-muted">Discount</span>
                    <span className="tt-mono tt-tabular" style={{ color: "var(--c-success)" }}>−₦{discount.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span className="tt-muted">VAT 7.5%</span>
                    <span className="tt-mono tt-tabular">₦{tax.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 1, background: "var(--c-border)", margin: "4px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>Total</span>
                    <span className="tt-head" style={{ fontSize: 32 }}>₦{total.toLocaleString()}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <button className="tt-btn tt-btn-secondary tt-btn-lg">
                    <IconTag size={14} /> Discount
                  </button>
                  <button className="tt-btn tt-btn-secondary tt-btn-lg">
                    <IconUsers size={14} /> Add customer
                  </button>
                </div>
                <button className="tt-btn tt-btn-primary tt-btn-lg" style={{ width: "100%", height: 56, fontSize: 16 }}>
                  Charge ₦{total.toLocaleString()} <IconArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* POS Payment modal preview screen */
function POSPayment(props) {
  const total = 62775;
  return (
    <div className="tt-app" data-collapsed="true" data-pos-mode="true">
      <aside className="tt-sidebar" style={{ width: 64 }}>
        <Sidebar role="cashier" active="pos" onNavigate={props.onNavigate} direction={props.direction} orgName={props.orgName} userName={props.userName} userRole={props.userRole} />
      </aside>
      <div className="tt-main" data-pos-mode="true">
        <Header title="Complete payment" subtitle="Sale #A00248 · ₦62,775" actions={<button className="tt-btn tt-btn-ghost" onClick={() => props.onNavigate("pos")}><IconX size={14} /> Cancel</button>} mode={props.mode} onToggleMode={props.onToggleMode} />
        <div className="tt-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - var(--header-h))", background: "var(--c-bgAlt)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 900, width: "100%" }}>
            <div className="tt-card" style={{ padding: 32 }}>
              <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Amount due</div>
              <div className="tt-head" style={{ fontSize: 56, marginBottom: 6 }}>₦{total.toLocaleString()}</div>
              <div className="tt-muted" style={{ fontSize: 14, marginBottom: 24 }}>22 items · Aba HQ · Cashier Chika</div>

              <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Choose payment method</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                  { name: "Cash", Icon: IconDollar, active: true, hint: "Tap to enter tendered" },
                  { name: "Transfer", Icon: IconCard, active: false, hint: "Zainpay reference" },
                  { name: "POS Card", Icon: IconCard, active: false, hint: "External terminal" },
                  { name: "Split", Icon: IconLayers, active: false, hint: "Multi-method payment" },
                ].map((m) => (
                  <button key={m.name} className="tt-card" style={{ padding: 16, textAlign: "left", cursor: "pointer", border: m.active ? "2px solid var(--c-primary)" : "1px solid var(--c-border)", background: m.active ? "color-mix(in oklch, var(--c-primary), transparent 92%)" : "var(--c-surface)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <m.Icon size={20} style={{ color: m.active ? "var(--c-primary)" : "var(--c-textMuted)" }} />
                      {m.active && <IconCheckCircle size={16} style={{ color: "var(--c-primary)" }} />}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</div>
                    <div className="tt-muted" style={{ fontSize: 11 }}>{m.hint}</div>
                  </button>
                ))}
              </div>

              <div className="tt-eyebrow" style={{ marginBottom: 10 }}>Tendered amount</div>
              <div style={{ position: "relative", marginBottom: 14 }}>
                <div className="tt-mono" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--c-textMuted)", fontSize: 20 }}>₦</div>
                <input className="tt-input tt-mono tt-tabular" style={{ paddingLeft: 40, height: 64, fontSize: 24, fontWeight: 700 }} defaultValue="70,000" />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[1000, 5000, 10000, 20000, 62775, 70000].map((v) => (
                  <button key={v} className="tt-btn tt-btn-secondary">₦{v.toLocaleString()}</button>
                ))}
              </div>
            </div>

            <div className="tt-card-flat" style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Change owed</div>
                <div className="tt-head" style={{ fontSize: 56, color: "var(--c-success)" }}>₦7,225</div>
              </div>

              <div className="tt-card" style={{ padding: 20 }}>
                <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Sale summary</div>
                {[
                  { l: "Items", v: "22" },
                  { l: "Subtotal", v: "₦58,860" },
                  { l: "Discount", v: "−₦500" },
                  { l: "VAT 7.5%", v: "₦4,415" },
                  { l: "Total", v: "₦62,775", bold: true },
                ].map((r) => (
                  <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed var(--c-border)", fontSize: 13 }}>
                    <span className="tt-muted">{r.l}</span>
                    <span className="tt-mono tt-tabular" style={{ fontWeight: r.bold ? 700 : 500, fontSize: r.bold ? 15 : 13 }}>{r.v}</span>
                  </div>
                ))}
              </div>

              <div className="tt-flex-col" style={{ gap: 10 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" style={{ width: 18, height: 18 }} defaultChecked /> Print receipt on completion
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" style={{ width: 18, height: 18 }} /> Email receipt to customer
                </label>
              </div>

              <button className="tt-btn tt-btn-primary" style={{ height: 64, fontSize: 18, fontWeight: 700 }} onClick={() => props.onNavigate("pos-receipt")}>
                Complete sale <IconCheck size={18} />
              </button>
              <button className="tt-btn tt-btn-ghost" onClick={() => props.onNavigate("pos")}>Back to cart</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Receipt screen */
function POSReceipt(props) {
  return (
    <div className="tt-app" data-collapsed="true">
      <aside className="tt-sidebar" style={{ width: 64 }}>
        <Sidebar role="cashier" active="pos" onNavigate={props.onNavigate} direction={props.direction} orgName={props.orgName} userName={props.userName} userRole={props.userRole} />
      </aside>
      <div className="tt-main">
        <Header title="Sale complete" subtitle="Receipt A00248 · Chika · 2m ago" mode={props.mode} onToggleMode={props.onToggleMode} />
        <div className="tt-content" style={{ display: "flex", justifyContent: "center", padding: 40, background: "var(--c-bgAlt)", minHeight: "calc(100vh - var(--header-h))" }}>
          <div style={{ maxWidth: 720, width: "100%", display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
            <div>
              <div className="tt-card" style={{ textAlign: "center", padding: 40, marginBottom: 20 }}>
                <div style={{ width: 72, height: 72, margin: "0 auto 16px", borderRadius: 999, background: "color-mix(in oklch, var(--c-success), transparent 85%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <IconCheckCircle size={40} style={{ color: "var(--c-success)" }} />
                </div>
                <div className="tt-head" style={{ fontSize: 32, marginBottom: 6 }}>Sale complete</div>
                <div className="tt-muted" style={{ fontSize: 14, marginBottom: 24 }}>Change: <span className="tt-mono" style={{ color: "var(--c-success)", fontWeight: 700 }}>₦7,225</span></div>
                <div className="tt-flex" style={{ justifyContent: "center" }}>
                  <button className="tt-btn tt-btn-primary tt-btn-lg" onClick={() => props.onNavigate("pos")}>Next sale <IconArrowRight size={14} /></button>
                  <button className="tt-btn tt-btn-secondary tt-btn-lg"><IconPrinter size={14} /> Reprint</button>
                  <button className="tt-btn tt-btn-secondary tt-btn-lg"><IconMail size={14} /> Email</button>
                </div>
              </div>
            </div>

            <div className="tt-receipt">
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, letterSpacing: 1 }}>ONYEKA PROVISION STORES</div>
                <div style={{ fontSize: 10 }}>18 Market Rd, Aba · +234 803 123 4567</div>
              </div>
              <div style={{ textAlign: "center", opacity: 0.6, margin: "6px 0" }}>********************************</div>
              <div style={{ fontSize: 10, marginBottom: 6 }}>
                <div>Receipt: <b>A00248</b></div>
                <div>Cashier: Chika</div>
                <div>2026-08-25 · 10:42 AM</div>
              </div>
              <div style={{ textAlign: "center", opacity: 0.6, margin: "6px 0" }}>********************************</div>
              {[
                ["Rice Mama Gold 25kg", 1, 42000],
                ["Peak Milk 400g × 3", 3, 9600],
                ["Indomie 70g × 12", 12, 3000],
                ["Coca-Cola 50cl × 6", 6, 1500],
                ["Subtotal", null, 58860],
                ["Discount", null, -500],
                ["VAT 7.5%", null, 4415],
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 11 }}>
                  <span>{r[0]}</span>
                  <span className="tt-tabular">₦{Math.abs(r[2]).toLocaleString()}{r[2] < 0 ? " CR" : ""}</span>
                </div>
              ))}
              <div style={{ textAlign: "center", opacity: 0.6, margin: "6px 0" }}>********************************</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 13 }}>
                <span>TOTAL</span>
                <span className="tt-tabular">₦62,775</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 6 }}>
                <span>Cash tendered</span><span className="tt-tabular">₦70,000</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span>Change</span><span className="tt-tabular">₦7,225</span>
              </div>
              <div style={{ textAlign: "center", margin: "16px 0", fontWeight: 700, letterSpacing: 1 }}>THANK YOU · COME AGAIN</div>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <div style={{ background: "var(--c-text)", padding: 8 }}>
                  <div style={{ display: "flex", gap: 1 }}>
                    {"⎸⎸ ⎸  ⎸ ⎸⎸ ⎸ ⎸⎸ ⎸⎸ ⎸  ⎸".split("").map((c, i) => <div key={i} style={{ width: c === " " ? 2 : c === "⎸" ? 2 : 1, height: 32, background: c === "⎸" ? "var(--c-surface)" : "transparent" }} />)}
                  </div>
                </div>
              </div>
              <div className="tt-mono" style={{ textAlign: "center", fontSize: 10, marginTop: 4, letterSpacing: 2 }}>A00248</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { POS, POSPayment, POSReceipt });
