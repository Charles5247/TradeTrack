/* App shell — sidebar + header used across dashboard pages. */

const NAV_GROUPS_BO = [
  { title: "Operate", items: [
    { key: "dashboard", label: "Dashboard", Icon: IconDashboard },
    { key: "pos", label: "Point of Sale", Icon: IconCart },
    { key: "sales", label: "Sales History", Icon: IconHistory },
    { key: "receipts", label: "Receipt Lookup", Icon: IconSearch },
  ]},
  { title: "Inventory", items: [
    { key: "products", label: "Products", Icon: IconPackage },
    { key: "inventory", label: "Inventory", Icon: IconWarehouse },
    { key: "purchase-orders", label: "Purchase Orders", Icon: IconClipboard },
    { key: "transfers", label: "Transfers", Icon: IconTransfer },
    { key: "vendors", label: "Vendors", Icon: IconBuilding },
  ]},
  { title: "Insights", items: [
    { key: "reports", label: "Reports", Icon: IconChart },
    { key: "audit", label: "Audit Trail", Icon: IconAudit },
  ]},
  { title: "Admin", items: [
    { key: "users", label: "Team", Icon: IconUsers },
    { key: "subscriptions", label: "Subscription", Icon: IconCard },
    { key: "settings", label: "Settings", Icon: IconSettings },
  ]},
];

const NAV_GROUPS_PO = [
  { title: "Platform", items: [
    { key: "admin", label: "Overview", Icon: IconShield },
    { key: "merchants", label: "Merchants", Icon: IconBuilding },
    { key: "subscriptions", label: "Plan Catalog", Icon: IconCard },
  ]},
  { title: "Admin", items: [
    { key: "notifications", label: "Notifications", Icon: IconBell },
    { key: "settings", label: "Settings", Icon: IconSettings },
  ]},
];

/* Sidebar renders inside .tt-sidebar */
function Sidebar({ role = "business_owner", active, onNavigate, direction, orgName, userName, userRole, notifCount = 3 }) {
  const groups = role === "platform_owner" ? NAV_GROUPS_PO : NAV_GROUPS_BO;

  return (
    <>
      <div style={{ padding: "18px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo direction={direction} size={30} />
      </div>

      <div style={{ padding: "0 12px 12px" }}>
        <div className="tt-card-flat" style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
          <IconStore size={16} className="tt-muted" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: "var(--c-textMuted)", lineHeight: 1.1 }}>{role === "platform_owner" ? "Platform" : "Organization"}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{orgName}</div>
          </div>
          <IconChevronDown size={14} className="tt-muted" />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
        {groups.map((group) => (
          <div key={group.title} style={{ marginBottom: 8 }}>
            <div className="tt-nav-section">{group.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {group.items.map((item) => {
                const isActive = active === item.key;
                return (
                  <div
                    key={item.key}
                    className="tt-nav-item"
                    data-active={isActive}
                    onClick={() => onNavigate(item.key)}
                  >
                    <item.Icon size={16} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.key === "notifications" && notifCount > 0 && (
                      <span className="tt-badge tt-badge-danger" style={{ padding: "0 6px", fontSize: 10 }}>{notifCount}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 12, borderTop: "1px solid var(--c-border)" }}>
        <div className="tt-flex" style={{ alignItems: "center" }}>
          <div className="tt-avatar" style={{ background: "var(--c-primary)", color: "var(--c-primaryFg)" }}>{userName?.[0] || "A"}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--c-text)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</div>
            <div style={{ fontSize: 11, color: "var(--c-textMuted)", textTransform: "capitalize" }}>{(userRole || "").replace("_", " ")}</div>
          </div>
          <IconLogout size={14} className="tt-muted" />
        </div>
      </div>
    </>
  );
}

/* Header — search + breadcrumb + sync + user actions */
function Header({ title, subtitle, actions, breadcrumb, online = true, onToggleMode, mode }) {
  return (
    <header className="tt-header">
      <div style={{ flex: 1, minWidth: 0 }}>
        {breadcrumb && (
          <div style={{ fontSize: 12, color: "var(--c-textMuted)", marginBottom: 2, display: "flex", gap: 6, alignItems: "center" }}>
            {breadcrumb.map((b, i) => (
              <React.Fragment key={i}>
                <span>{b}</span>
                {i < breadcrumb.length - 1 && <IconChevronRight size={12} />}
              </React.Fragment>
            ))}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 20, fontWeight: "var(--font-display-weight)", letterSpacing: "var(--letter-tight)", color: "var(--c-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          {subtitle && <div className="tt-muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>}
        </div>
      </div>

      <div style={{ position: "relative", minWidth: 260 }}>
        <IconSearch size={14} className="tt-muted" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input className="tt-input" style={{ paddingLeft: 34, paddingRight: 50 }} placeholder="Search products, sales, merchants…" />
        <span className="tt-kbd" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>⌘K</span>
      </div>

      <div className="tt-flex" style={{ alignItems: "center", gap: 8 }}>
        <span
          className="tt-badge"
          data-online={online}
          style={{
            background: online ? "color-mix(in oklch, var(--c-success), transparent 85%)" : "color-mix(in oklch, var(--c-warn), transparent 85%)",
            color: online ? "var(--c-success)" : "var(--c-warn)",
            borderColor: online ? "color-mix(in oklch, var(--c-success), transparent 70%)" : "color-mix(in oklch, var(--c-warn), transparent 70%)",
          }}
        >
          {online ? <IconWifi size={12} /> : <IconWifiOff size={12} />}
          {online ? "Online" : "Offline · 4 queued"}
        </span>

        <button className="tt-btn tt-btn-ghost tt-btn-icon" onClick={onToggleMode} aria-label="Toggle theme">
          {mode === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>

        <button className="tt-btn tt-btn-ghost tt-btn-icon" aria-label="Notifications" style={{ position: "relative" }}>
          <IconBell size={16} />
          <span style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, background: "var(--c-danger)", borderRadius: 999, border: "2px solid var(--c-bg)" }} />
        </button>

        {actions}
      </div>
    </header>
  );
}

/* Page container */
function Page({ children, wide = false }) {
  return (
    <div className="tt-content tt-fadein">
      <div style={{ maxWidth: wide ? "none" : 1360, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}

/* Screen frame: sidebar + header + page for dashboard-role screens */
function AppScreen({ children, role, active, onNavigate, direction, orgName, userName, userRole, title, subtitle, actions, breadcrumb, mode, onToggleMode }) {
  return (
    <div className="tt-app" data-collapsed="false">
      <aside className="tt-sidebar">
        <Sidebar
          role={role}
          active={active}
          onNavigate={onNavigate}
          direction={direction}
          orgName={orgName}
          userName={userName}
          userRole={userRole}
        />
      </aside>
      <div className="tt-main">
        <Header title={title} subtitle={subtitle} actions={actions} breadcrumb={breadcrumb} mode={mode} onToggleMode={onToggleMode} />
        {children}
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Header, Page, AppScreen, NAV_GROUPS_BO, NAV_GROUPS_PO });
