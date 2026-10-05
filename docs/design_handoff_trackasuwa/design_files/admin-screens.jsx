/* Admin screens: Users (per-org), Settings, Subscription/Billing, Platform Owner Admin, Merchants directory. */

/* Team / Users */
function Users(props) {
  const users = [
    { name: "Amaka Onyeka", email: "amaka@onyekastores.ng", role: "business_owner", status: "active", last: "Just now" },
    { name: "Bola Adekunle", email: "bola@onyekastores.ng", role: "admin", status: "active", last: "5m ago" },
    { name: "Chika Eze", email: "chika@onyekastores.ng", role: "cashier", status: "active", last: "2m ago" },
    { name: "Emeka Nwosu", email: "emeka@onyekastores.ng", role: "cashier", status: "active", last: "1h ago" },
    { name: "Halima Bello", email: "halima@onyekastores.ng", role: "cashier", status: "invited", last: "Never" },
    { name: "Tunde Ojo", email: "tunde@onyekastores.ng", role: "cashier", status: "suspended", last: "3d ago" },
  ];
  const roleBadge = { business_owner: "primary", admin: "info", cashier: "neutral" };
  const statusBadge = { active: "success", invited: "warn", suspended: "danger" };
  return (
    <AppScreen {...props} role="business_owner" active="users" title="Team" subtitle="Manage who can access your shop"
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconExport size={14} /> Export</button>
        <button className="tt-btn tt-btn-primary"><IconPlus size={14} /> Invite user</button>
      </>}
    >
      <Page>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Total users" value="6" sub="Growth plan · 15 max" Icon={IconUsers} />
          <StatCard label="Active this week" value="5" delta="+1" deltaDir="up" Icon={IconCheckCircle} />
          <StatCard label="Admin & owner" value="2" sub="Full access" Icon={IconShield} />
          <StatCard label="Cashiers" value="4" sub="POS-only access" Icon={IconCart} />
        </div>

        <div className="tt-card" style={{ padding: 0 }}>
          <table className="tt-table">
            <thead>
              <tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last active</th><th></th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="tt-avatar" style={{ background: "color-mix(in oklch, var(--c-primary), transparent 85%)", color: "var(--c-primary)" }}>{u.name[0]}</div>
                      <div style={{ fontWeight: 550 }}>{u.name}</div>
                    </div>
                  </td>
                  <td className="tt-muted">{u.email}</td>
                  <td><span className={`tt-badge tt-badge-${roleBadge[u.role]}`}>{u.role.replace("_", " ")}</span></td>
                  <td><span className={`tt-badge tt-badge-${statusBadge[u.status]}`}>{u.status}</span></td>
                  <td className="tt-muted">{u.last}</td>
                  <td><button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconMore size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="tt-card-flat" style={{ marginTop: 20, padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Custom role permissions — Business plan+</div>
            <div className="tt-muted" style={{ fontSize: 13, marginTop: 4 }}>Build roles that match your team, not the reverse. Currently on Growth plan.</div>
          </div>
          <button className="tt-btn tt-btn-primary" onClick={() => props.onNavigate("subscriptions")}>Upgrade to Business</button>
        </div>
      </Page>
    </AppScreen>
  );
}

/* Settings */
function SettingsPage(props) {
  return (
    <AppScreen {...props} role="business_owner" active="settings" title="Settings" subtitle="Your business, your rules">
      <Page>
        <div className="tt-grid" style={{ gridTemplateColumns: "220px 1fr", gap: 32 }}>
          <div className="tt-flex-col" style={{ gap: 2 }}>
            {["General", "Business profile", "Localization", "Receipt template", "Tax rules", "Devices & printers", "Offline sync", "Notifications", "API keys", "Data & export"].map((s, i) => (
              <div key={s} className="tt-nav-item" data-active={i === 1}>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div className="tt-flex-col" style={{ gap: 20 }}>
            <div className="tt-card">
              <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 6 }}>Business profile</div>
              <div className="tt-muted" style={{ fontSize: 13, marginBottom: 20 }}>Shown on receipts, invoices, and your Zainpay account.</div>
              <div className="tt-grid tt-grid-2" style={{ gap: 16 }}>
                <div>
                  <label className="tt-label">Business name</label>
                  <input className="tt-input" defaultValue="Onyeka Provision Stores" />
                </div>
                <div>
                  <label className="tt-label">Registered as (CAC)</label>
                  <input className="tt-input" defaultValue="RC 2841923" />
                </div>
                <div>
                  <label className="tt-label">Phone</label>
                  <input className="tt-input" defaultValue="+234 803 123 4567" />
                </div>
                <div>
                  <label className="tt-label">Email</label>
                  <input className="tt-input" defaultValue="hello@onyekastores.ng" />
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <label className="tt-label">Address</label>
                  <input className="tt-input" defaultValue="18 Market Rd, Aba, Abia State, Nigeria" />
                </div>
              </div>
            </div>

            <div className="tt-card">
              <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 20 }}>Brand</div>
              <div className="tt-flex" style={{ alignItems: "center" }}>
                <div className="tt-placeholder" style={{ width: 96, height: 96, fontSize: 10 }}>logo</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Business logo</div>
                  <div className="tt-muted" style={{ fontSize: 12, marginBottom: 12 }}>PNG · min 256×256px · shown on receipts and PWA install</div>
                  <button className="tt-btn tt-btn-secondary"><IconUpload size={13} /> Upload</button>
                </div>
              </div>
            </div>

            <div className="tt-card">
              <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 20 }}>Language & currency</div>
              <div className="tt-grid tt-grid-2" style={{ gap: 16 }}>
                <div>
                  <label className="tt-label">Language</label>
                  <select className="tt-input">
                    <option>English</option><option>Hausa</option><option>Yoruba (partial)</option><option>Igbo (partial)</option><option>Pidgin (partial)</option>
                  </select>
                </div>
                <div>
                  <label className="tt-label">Currency</label>
                  <select className="tt-input"><option>Naira (₦)</option></select>
                </div>
                <div>
                  <label className="tt-label">Timezone</label>
                  <select className="tt-input"><option>Africa/Lagos (WAT)</option></select>
                </div>
                <div>
                  <label className="tt-label">Date format</label>
                  <select className="tt-input"><option>24 Aug 2026</option><option>2026-08-24</option><option>24/08/2026</option></select>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button className="tt-btn tt-btn-ghost">Cancel</button>
              <button className="tt-btn tt-btn-primary">Save changes</button>
            </div>
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

/* Subscription & billing */
function Subscriptions(props) {
  return (
    <AppScreen {...props} role="business_owner" active="subscriptions" title="Subscription" subtitle="Your plan, your payments, your Zainpay account">
      <Page>
        <div className="tt-grid" style={{ gridTemplateColumns: "1.5fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="tt-card" style={{ padding: 32, background: "var(--c-primary)", color: "var(--c-primaryFg)", borderColor: "transparent", position: "relative", overflow: "hidden" }}>
            <div className="tt-blob" style={{ top: -40, right: -60, width: 260, height: 260, background: "var(--c-accent)", opacity: 0.3 }} />
            <div style={{ position: "relative" }}>
              <div className="tt-badge" style={{ background: "color-mix(in oklch, var(--c-primaryFg), transparent 85%)", color: "var(--c-primaryFg)", borderColor: "transparent", marginBottom: 12 }}>Current plan</div>
              <div className="tt-head" style={{ fontSize: 48 }}>Growth</div>
              <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>Multi-branch, real momentum</div>
              <div style={{ display: "flex", gap: 32, alignItems: "baseline" }}>
                <div>
                  <div className="tt-head" style={{ fontSize: 40 }}>₦7,500</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>per month</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Next payment</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>1 Sep 2026</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Auto-renew</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>On</div>
                </div>
              </div>
              <div className="tt-flex" style={{ marginTop: 24 }}>
                <button className="tt-btn" style={{ background: "var(--c-primaryFg)", color: "var(--c-primary)" }}>Change plan</button>
                <button className="tt-btn tt-btn-ghost" style={{ color: "var(--c-primaryFg)", border: "1px solid color-mix(in oklch, var(--c-primaryFg), transparent 60%)" }}>Cancel subscription</button>
              </div>
            </div>
          </div>

          <div className="tt-card">
            <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Your Zainpay Naira account</div>
            <div style={{ fontSize: 12, color: "var(--c-textMuted)", marginBottom: 4 }}>Bank</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Zainpay MFB</div>
            <div style={{ fontSize: 12, color: "var(--c-textMuted)", marginBottom: 4 }}>Account number (NUBAN)</div>
            <div className="tt-flex" style={{ alignItems: "center", marginBottom: 16 }}>
              <div className="tt-head tt-mono" style={{ fontSize: 26, letterSpacing: "0.02em" }}>0912344978</div>
              <button className="tt-btn tt-btn-ghost tt-btn-icon"><IconCopy size={14} /></button>
            </div>
            <div style={{ fontSize: 12, color: "var(--c-textMuted)", marginBottom: 4 }}>Account name</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>ONYEKA PROVISION STORES / TRADETRACK</div>
            <div className="tt-card-flat" style={{ padding: 12, display: "flex", gap: 10 }}>
              <IconInfo size={14} className="tt-muted" style={{ marginTop: 2 }} />
              <div style={{ fontSize: 12, color: "var(--c-textMuted)" }}>Any transfer to this account is auto-reconciled to your subscription. No reference required.</div>
            </div>
          </div>
        </div>

        <div className="tt-tabs">
          <div className="tt-tab" data-active="true">Plans</div>
          <div className="tt-tab">Billing history</div>
          <div className="tt-tab">Payment methods</div>
          <div className="tt-tab">Usage</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, alignItems: "stretch" }}>
          {[
            { name: "Free", price: 0, limits: ["1 shop", "50 products", "2 users"] },
            { name: "Starter", price: 3500, limits: ["1 shop", "500 products", "5 users"] },
            { name: "Growth", price: 7500, current: true, limits: ["3 shops", "5,000 products", "15 users", "Transfers"] },
            { name: "Business", price: 18000, limits: ["10 shops", "Unlimited SKUs", "50 users", "Purchase Orders", "Custom roles"] },
            { name: "Enterprise", price: null, limits: ["Unlimited everything", "SSO & audit", "SLA & CSM"] },
          ].map((p) => (
            <div key={p.name} className="tt-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, border: p.current ? "2px solid var(--c-primary)" : "1px solid var(--c-border)", position: "relative" }}>
              {p.current && <span className="tt-badge tt-badge-primary" style={{ position: "absolute", top: -10, right: 16 }}>Current</span>}
              <div>
                <div className="tt-head" style={{ fontSize: 20 }}>{p.name}</div>
                {p.price === 0 && <div className="tt-head" style={{ fontSize: 24, marginTop: 6 }}>Free</div>}
                {p.price && <div className="tt-head" style={{ fontSize: 24, marginTop: 6 }}>₦{p.price.toLocaleString()}<span className="tt-muted" style={{ fontSize: 11, fontFamily: "var(--font-body)", fontWeight: 400 }}>/mo</span></div>}
                {p.price === null && <div className="tt-head" style={{ fontSize: 20, marginTop: 6 }}>Custom</div>}
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                {p.limits.map((l) => (
                  <li key={l} style={{ display: "flex", gap: 6 }}>
                    <IconCheck size={12} style={{ color: "var(--c-success)", marginTop: 3, flexShrink: 0 }} />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
              <button className={`tt-btn ${p.current ? "tt-btn-secondary" : "tt-btn-primary"}`} disabled={p.current}>
                {p.current ? "Current plan" : p.price === null ? "Talk to sales" : "Change"}
              </button>
            </div>
          ))}
        </div>
      </Page>
    </AppScreen>
  );
}

/* Platform Owner: Admin overview */
function PlatformAdmin(props) {
  return (
    <AppScreen {...props} role="platform_owner" active="admin" title="Platform Overview" subtitle="TradeTrack Nigeria · 12,432 merchants"
      userRole="platform_owner" orgName="TradeTrack Platform" userName="Charles Nnaji"
      actions={<button className="tt-btn tt-btn-primary"><IconExport size={14} /> Weekly digest</button>}
    >
      <Page>
        <div className="tt-grid tt-grid-4" style={{ marginBottom: 20 }}>
          <StatCard label="Total merchants" value="12,432" delta="+284" deltaDir="up" sub="Last 7 days" Icon={IconBuilding} />
          <StatCard label="MRR" value="₦48.2M" delta="+₦4.1M" deltaDir="up" sub="+9.2% MoM" Icon={IconDollar} />
          <StatCard label="Paid plans" value="3,201" delta="+112" deltaDir="up" sub="25.7% conversion" Icon={IconCard} />
          <StatCard label="Churn (30d)" value="1.8%" delta="-0.4pp" deltaDir="up" sub="Best in class" Icon={IconTrending} />
        </div>

        <div className="tt-grid" style={{ gridTemplateColumns: "1.5fr 1fr", marginBottom: 20 }}>
          <div className="tt-card">
            <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 14 }}>Platform-wide GMV · last 12 weeks</div>
            <SalesChart />
          </div>
          <div className="tt-card">
            <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 14 }}>Plan mix</div>
            {[
              { p: "Free", n: 9231, c: "var(--c-textFaint)", pct: 74 },
              { p: "Starter", n: 1820, c: "var(--c-info)", pct: 15 },
              { p: "Growth", n: 1050, c: "var(--c-primary)", pct: 8 },
              { p: "Business", n: 298, c: "var(--c-accent)", pct: 2 },
              { p: "Enterprise", n: 33, c: "var(--c-success)", pct: 1 },
            ].map((p) => (
              <div key={p.p} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: p.c }} />
                    <span>{p.p}</span>
                  </div>
                  <div className="tt-mono tt-tabular">{p.n.toLocaleString()} · {p.pct}%</div>
                </div>
                <div className="tt-progress" style={{ height: 4 }}>
                  <div className="tt-progress-bar" style={{ width: `${p.pct * 1.3}%`, background: p.c }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tt-grid tt-grid-2" style={{ gap: 20 }}>
          <div className="tt-card">
            <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 14 }}>Top merchants by GMV (30d)</div>
            {[
              { n: "Alaba Electronics", gmv: 24800000, plan: "Enterprise" },
              { n: "Bola Distributors", gmv: 18100000, plan: "Business" },
              { n: "Umeh & Sons Ltd", gmv: 14500000, plan: "Business" },
              { n: "Kano Grains Depot", gmv: 12300000, plan: "Growth" },
              { n: "Onyeka Provision Stores", gmv: 8240000, plan: "Growth" },
            ].map((m, i) => (
              <div key={m.n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? "none" : "1px solid var(--c-border)" }}>
                <div className="tt-mono tt-faint" style={{ width: 20, textAlign: "center", fontSize: 12 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 550 }}>{m.n}</div>
                  <div className="tt-muted" style={{ fontSize: 11 }}>{m.plan}</div>
                </div>
                <div className="tt-mono tt-tabular" style={{ fontWeight: 600 }}>₦{(m.gmv / 1_000_000).toFixed(1)}M</div>
              </div>
            ))}
          </div>

          <div className="tt-card">
            <div className="tt-section-title" style={{ fontSize: 18, marginBottom: 14 }}>System health</div>
            {[
              { l: "API uptime · 30d", v: "99.98%", ok: true },
              { l: "Sync engine · avg latency", v: "184ms", ok: true },
              { l: "Zainpay webhooks · success rate", v: "99.7%", ok: true },
              { l: "Failed logins · last hour", v: "12", ok: true },
              { l: "Errored offline syncs · last 24h", v: "3", ok: false },
              { l: "Support tickets · open", v: "42", ok: true },
            ].map((r) => (
              <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--c-border)" }}>
                <div className="tt-flex" style={{ alignItems: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: r.ok ? "var(--c-success)" : "var(--c-warn)" }} />
                  <span style={{ fontSize: 13 }}>{r.l}</span>
                </div>
                <div className="tt-mono tt-tabular" style={{ fontWeight: 600, fontSize: 13 }}>{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      </Page>
    </AppScreen>
  );
}

/* Merchants directory */
function Merchants(props) {
  const merchants = [
    { n: "Alaba Electronics", loc: "Alaba Intl. Market, Lagos", plan: "Enterprise", gmv: 24800000, users: 42, joined: "Jan 2025", status: "active" },
    { n: "Bola Distributors", loc: "Onitsha, Anambra", plan: "Business", gmv: 18100000, users: 22, joined: "Mar 2025", status: "active" },
    { n: "Umeh & Sons Ltd", loc: "Enugu", plan: "Business", gmv: 14500000, users: 18, joined: "Feb 2025", status: "active" },
    { n: "Kano Grains Depot", loc: "Sabon Gari, Kano", plan: "Growth", gmv: 12300000, users: 12, joined: "Apr 2025", status: "active" },
    { n: "Onyeka Provision Stores", loc: "Ariaria, Aba", plan: "Growth", gmv: 8240000, users: 6, joined: "Aug 2025", status: "active" },
    { n: "Balogun Textiles", loc: "Lagos Island", plan: "Growth", gmv: 6100000, users: 8, joined: "May 2025", status: "active" },
    { n: "Mama Nkechi Foods", loc: "Nnewi, Anambra", plan: "Starter", gmv: 2410000, users: 3, joined: "Jun 2026", status: "trial" },
    { n: "Chuka Auto Parts", loc: "Nkpor, Anambra", plan: "Starter", gmv: 1800000, users: 4, joined: "Jul 2026", status: "active" },
    { n: "Kaduna Rice Depot", loc: "Kaduna", plan: "Free", gmv: 240000, users: 1, joined: "20 Aug 2026", status: "onboarding" },
  ];
  const planBadge = { Free: "neutral", Starter: "info", Growth: "primary", Business: "warn", Enterprise: "success" };
  const statBadge = { active: "success", trial: "warn", onboarding: "info", suspended: "danger" };

  return (
    <AppScreen {...props} role="platform_owner" active="merchants" title="Merchants" subtitle="12,432 merchants across Nigeria"
      userRole="platform_owner" orgName="TradeTrack Platform" userName="Charles Nnaji"
      actions={<>
        <button className="tt-btn tt-btn-secondary"><IconExport size={14} /> Export</button>
        <button className="tt-btn tt-btn-primary"><IconPlus size={14} /> Onboard merchant</button>
      </>}
    >
      <Page>
        <div className="tt-flex" style={{ justifyContent: "space-between", marginBottom: 16 }}>
          <div className="tt-flex">
            <div style={{ position: "relative", width: 280 }}>
              <IconSearch size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input className="tt-input" style={{ paddingLeft: 34 }} placeholder="Merchant, RC, or NUBAN…" />
            </div>
            <button className="tt-btn tt-btn-secondary">All plans</button>
            <button className="tt-btn tt-btn-secondary">All states</button>
            <button className="tt-btn tt-btn-secondary">Active</button>
          </div>
          <div className="tt-seg">
            <div className="tt-seg-item" data-active="true">Table</div>
            <div className="tt-seg-item">Map</div>
          </div>
        </div>

        <div className="tt-card" style={{ padding: 0 }}>
          <table className="tt-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Location</th>
                <th>Plan</th>
                <th style={{ textAlign: "right" }}>GMV · 30d</th>
                <th style={{ textAlign: "right" }}>Users</th>
                <th>Joined</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.n}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="tt-avatar" style={{ background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)" }}>{m.n[0]}</div>
                      <div style={{ fontWeight: 550 }}>{m.n}</div>
                    </div>
                  </td>
                  <td className="tt-muted">{m.loc}</td>
                  <td><span className={`tt-badge tt-badge-${planBadge[m.plan]}`}>{m.plan}</span></td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right", fontWeight: 600 }}>₦{m.gmv.toLocaleString()}</td>
                  <td className="tt-mono tt-tabular" style={{ textAlign: "right" }}>{m.users}</td>
                  <td className="tt-muted">{m.joined}</td>
                  <td><span className={`tt-badge tt-badge-${statBadge[m.status]}`}>{m.status}</span></td>
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

Object.assign(window, { Users, SettingsPage, Subscriptions, PlatformAdmin, Merchants });
