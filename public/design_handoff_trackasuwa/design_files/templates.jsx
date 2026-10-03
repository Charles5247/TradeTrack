/* Reusable page templates. Every future Add/Edit/Detail screen inherits from these
 * so the design stays consistent without me having to mock each one individually. */

/* ─── Empty state ─── */
function EmptyState({ Icon, title, body, action, secondary }) {
  return (
    <div className="tt-card" style={{ padding: 60, textAlign: "center", background: "var(--c-surfaceAlt)" }}>
      {Icon && (
        <div style={{ width: 56, height: 56, margin: "0 auto 20px", borderRadius: "var(--radius-lg)", background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={28} />
        </div>
      )}
      <div className="tt-head" style={{ fontSize: 22, marginBottom: 8 }}>{title}</div>
      {body && <div className="tt-muted" style={{ fontSize: 14, maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.55 }}>{body}</div>}
      {(action || secondary) && (
        <div className="tt-flex" style={{ justifyContent: "center" }}>
          {secondary}
          {action}
        </div>
      )}
    </div>
  );
}

/* ─── Loading skeleton ─── */
function Skeleton({ w = "100%", h = 14, rounded = "var(--radius-sm)", style = {} }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: rounded,
        background: "color-mix(in oklch, var(--c-borderStrong), transparent 50%)",
        animation: "tt-skeleton 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function LoadingState({ rows = 6 }) {
  return (
    <div className="tt-card" style={{ padding: 0 }}>
      <table className="tt-table">
        <thead>
          <tr>
            {["Column", "Column", "Column", "Column", "Column"].map((_, i) => (
              <th key={i}><Skeleton w={70} h={11} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {[0, 1, 2, 3, 4].map((c) => (
                <td key={c}><Skeleton w={c === 0 ? 160 : c === 4 ? 60 : 100} h={12} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Error state ─── */
function ErrorState({ title = "Something went wrong", body, onRetry }) {
  return (
    <div className="tt-card" style={{ padding: 60, textAlign: "center", background: "color-mix(in oklch, var(--c-danger), transparent 96%)", borderColor: "color-mix(in oklch, var(--c-danger), transparent 82%)" }}>
      <div style={{ width: 56, height: 56, margin: "0 auto 20px", borderRadius: "var(--radius-lg)", background: "color-mix(in oklch, var(--c-danger), transparent 88%)", color: "var(--c-danger)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <IconAlert size={28} />
      </div>
      <div className="tt-head" style={{ fontSize: 22, marginBottom: 8 }}>{title}</div>
      {body && <div className="tt-muted" style={{ fontSize: 14, maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.55 }}>{body}</div>}
      {onRetry && (
        <button className="tt-btn tt-btn-secondary" onClick={onRetry}>
          <IconRefresh size={14} /> Try again
        </button>
      )}
    </div>
  );
}

/* ─── Modal / Dialog ─── */
function Modal({ title, subtitle, children, onClose, actions, size = "md", open = true }) {
  if (!open) return null;
  const widths = { sm: 420, md: 560, lg: 720, xl: 960 };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ position: "absolute", inset: 0, background: "color-mix(in oklch, var(--c-text), transparent 60%)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="tt-card" style={{ position: "relative", width: "100%", maxWidth: widths[size], maxHeight: "90vh", overflow: "auto", padding: 0, boxShadow: "0 30px 60px -15px rgba(0,0,0,0.4)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div className="tt-head" style={{ fontSize: 20 }}>{title}</div>
            {subtitle && <div className="tt-muted" style={{ fontSize: 13, marginTop: 4 }}>{subtitle}</div>}
          </div>
          <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm" onClick={onClose}><IconX size={14} /></button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {actions && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--c-border)", background: "var(--c-surfaceAlt)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Toast ─── */
function Toast({ type = "info", title, body }) {
  const iconMap = { info: IconInfo, success: IconCheckCircle, warn: IconAlert, danger: IconAlert };
  const Icon = iconMap[type];
  return (
    <div className="tt-card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start", maxWidth: 380, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.2)" }}>
      <div style={{ width: 32, height: 32, borderRadius: "var(--radius)", background: `color-mix(in oklch, var(--c-${type === "danger" ? "danger" : type}), transparent 85%)`, color: `var(--c-${type === "danger" ? "danger" : type})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        {body && <div className="tt-muted" style={{ fontSize: 12, marginTop: 4 }}>{body}</div>}
      </div>
      <button className="tt-btn tt-btn-ghost tt-btn-icon tt-btn-sm"><IconX size={12} /></button>
    </div>
  );
}

/* ─── Detail page template ─── */
/* Use for: PO detail, Merchant detail, Warehouse detail, Vendor detail, User detail, Sale detail */
function DetailTemplate({
  breadcrumb,
  title, subtitle, meta,          // top
  primary, secondary,             // action buttons top-right
  statusBadge,
  overviewCards = [],             // small KPI cards under header
  tabs,                            // { active, items: [{key, label}], onChange }
  mainContent,                     // left column (bulk of the page)
  sideContent,                     // right column (actions, metadata)
}) {
  return (
    <>
      {/* Sticky page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 20 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div className="tt-head" style={{ fontSize: 32, lineHeight: 1.1 }}>{title}</div>
              {statusBadge}
            </div>
            {subtitle && <div className="tt-muted" style={{ fontSize: 14 }}>{subtitle}</div>}
            {meta && (
              <div className="tt-flex" style={{ gap: 24, marginTop: 12 }}>
                {meta.map((m) => (
                  <div key={m.label}>
                    <div style={{ fontSize: 11, color: "var(--c-textFaint)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 550 }}>{m.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="tt-flex">
            {secondary}
            {primary}
          </div>
        </div>

        {overviewCards.length > 0 && (
          <div className={`tt-grid tt-grid-${Math.min(overviewCards.length, 4)}`} style={{ marginBottom: tabs ? 20 : 0 }}>
            {overviewCards.map((c, i) => <StatCard key={i} {...c} />)}
          </div>
        )}

        {tabs && (
          <div className="tt-tabs">
            {tabs.items.map((t) => (
              <div
                key={t.key}
                className="tt-tab"
                data-active={t.key === tabs.active}
                onClick={() => tabs.onChange?.(t.key)}
              >{t.label}</div>
            ))}
          </div>
        )}
      </div>

      <div className="tt-grid" style={{ gridTemplateColumns: sideContent ? "1.6fr 1fr" : "1fr", gap: 20 }}>
        <div>{mainContent}</div>
        {sideContent && <div>{sideContent}</div>}
      </div>
    </>
  );
}

/* ─── Form page template ─── */
/* Use for: Product Add/Edit, User Invite, Warehouse Create, Vendor Add, Merchant Onboard */
function FormTemplate({
  sections,                        // [{ title, description?, fields: <ReactNode> }]
  sidebar,                         // aside content (help, preview, tips)
  onCancel, onSave,
  saveLabel = "Save changes",
  isNew = false,
}) {
  return (
    <div className="tt-grid" style={{ gridTemplateColumns: sidebar ? "2fr 1fr" : "1fr", gap: 32 }}>
      <div className="tt-flex-col" style={{ gap: 20 }}>
        {sections.map((sec, i) => (
          <div key={i} className="tt-card">
            <div style={{ marginBottom: 20 }}>
              <div className="tt-section-title" style={{ fontSize: 18 }}>{sec.title}</div>
              {sec.description && <div className="tt-muted" style={{ fontSize: 13, marginTop: 4 }}>{sec.description}</div>}
            </div>
            {sec.fields}
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="tt-btn tt-btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="tt-btn tt-btn-primary" onClick={onSave}>{isNew ? "Create" : saveLabel}</button>
        </div>
      </div>
      {sidebar && (
        <div className="tt-flex-col" style={{ gap: 16 }}>
          {sidebar}
        </div>
      )}
    </div>
  );
}

/* ─── Common form field cluster ─── */
function Field({ label, hint, error, children, half }) {
  return (
    <div style={{ marginBottom: 16, ...(half ? { display: "inline-block", width: "calc(50% - 8px)", marginRight: 8, verticalAlign: "top" } : {}) }}>
      {label && <label className="tt-label">{label}</label>}
      {children}
      {hint && !error && <div className="tt-muted" style={{ fontSize: 11, marginTop: 6 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11, marginTop: 6, color: "var(--c-danger)" }}>{error}</div>}
    </div>
  );
}

Object.assign(window, {
  EmptyState, Skeleton, LoadingState, ErrorState, Modal, Toast,
  DetailTemplate, FormTemplate, Field,
});
