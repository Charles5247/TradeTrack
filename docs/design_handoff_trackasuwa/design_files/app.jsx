/* App root — Direction switcher (top), Screen navigator (left), Tweaks (right). */

const { useState, useEffect, useCallback, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "direction": "ledger",
  "mode": "light",
  "density": "balanced",
  "primaryOverride": "",
  "radiusOverride": null
}/*EDITMODE-END*/;

const SCREENS = [
  { g: "Marketing", items: [
    { k: "landing", l: "Landing", C: (p) => <Landing {...p} /> },
    { k: "features", l: "Features", C: (p) => <Features {...p} /> },
    { k: "industries", l: "Industries", C: (p) => <IndustriesPage {...p} /> },
    { k: "pricing", l: "Pricing", C: (p) => <Pricing {...p} /> },
    { k: "download", l: "Download", C: (p) => <Download {...p} /> },
  ]},
  { g: "Auth", items: [
    { k: "auth-login", l: "Login", C: (p) => <Login {...p} /> },
    { k: "auth-signup", l: "Signup", C: (p) => <Signup {...p} /> },
    { k: "auth-forgot", l: "Forgot password", C: (p) => <Forgot {...p} /> },
    { k: "auth-change", l: "Change password", C: (p) => <ChangePassword {...p} /> },
  ]},
  { g: "Business Owner", items: [
    { k: "dashboard", l: "Dashboard", C: (p) => <Dashboard {...p} /> },
    { k: "pos", l: "POS · checkout", C: (p) => <POS {...p} /> },
    { k: "pos-payment", l: "POS · payment", C: (p) => <POSPayment {...p} /> },
    { k: "pos-receipt", l: "POS · receipt", C: (p) => <POSReceipt {...p} /> },
    { k: "sales", l: "Sales history", C: (p) => <Sales {...p} /> },
    { k: "sale-detail", l: "Sale · detail", C: (p) => <SaleDetail {...p} /> },
    { k: "receipt-lookup", l: "Receipt lookup", C: (p) => <ReceiptLookup {...p} /> },
    { k: "products", l: "Products", C: (p) => <Products {...p} /> },
    { k: "product-edit", l: "Product · edit", C: (p) => <ProductEdit {...p} /> },
    { k: "inventory", l: "Inventory", C: (p) => <Inventory {...p} /> },
    { k: "warehouses", l: "Warehouses", C: (p) => <Warehouses {...p} /> },
    { k: "purchase-orders", l: "Purchase Orders", C: (p) => <PurchaseOrders {...p} /> },
    { k: "po-create", l: "PO · create", C: (p) => <POCreate {...p} /> },
    { k: "transfers", l: "Transfers", C: (p) => <Transfers {...p} /> },
    { k: "vendors", l: "Vendors", C: (p) => <Vendors {...p} /> },
    { k: "reports", l: "Reports", C: (p) => <Reports {...p} /> },
    { k: "audit", l: "Audit trail", C: (p) => <Audit {...p} /> },
    { k: "notifications", l: "Notifications", C: (p) => <Notifications {...p} /> },
    { k: "users", l: "Team & Users", C: (p) => <Users {...p} /> },
    { k: "subscriptions", l: "Subscription", C: (p) => <Subscriptions {...p} /> },
    { k: "settings", l: "Settings", C: (p) => <SettingsPage {...p} /> },
  ]},
  { g: "Platform Owner", items: [
    { k: "admin", l: "Platform overview", C: (p) => <PlatformAdmin {...p} /> },
    { k: "merchants", l: "Merchants directory", C: (p) => <Merchants {...p} /> },
    { k: "merchant-detail", l: "Merchant · detail", C: (p) => <MerchantDetail {...p} /> },
  ]},
  { g: "Production & Hospitality (Extension)", items: [
    { k: "prod-restaurant", l: "Restaurant · KDS", C: (p) => <RestaurantScreen {...p} /> },
    { k: "prod-bakery", l: "Bakery · Production", C: (p) => <BakeryScreen {...p} /> },
    { k: "prod-hotel", l: "Hotel · Front desk", C: (p) => <HotelScreen {...p} /> },
    { k: "prod-mall", l: "Mall Manager", C: (p) => <MallScreen {...p} /> },
  ]},
  { g: "Mobile", items: [
    { k: "mobile", l: "Android · POS + Dashboard", C: (p) => <MobileScreens {...p} /> },
  ]},
  { g: "System", items: [
    { k: "system", l: "Design tokens", C: (p) => <SystemPage {...p} /> },
  ]},
];

const flatScreens = SCREENS.flatMap((g) => g.items);

const DIRECTIONS_ARR = [
  { k: "ledger", l: "Ledger" },
  { k: "market", l: "Market" },
  { k: "operator", l: "Operator" },
  { k: "retail", l: "Retail" },
];

function App() {
  const [tweaks, setTweaksState] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("tt-tweaks") || "null");
      return stored ? { ...TWEAK_DEFAULTS, ...stored } : TWEAK_DEFAULTS;
    } catch {
      return TWEAK_DEFAULTS;
    }
  });
  const [screen, setScreen] = useState(() => {
    const hash = window.location.hash.replace("#/", "");
    return flatScreens.find((s) => s.k === hash)?.k || "landing";
  });

  const setTweak = useCallback((key, val) => {
    setTweaksState((prev) => {
      const next = typeof key === "object" ? { ...prev, ...key } : { ...prev, [key]: val };
      localStorage.setItem("tt-tweaks", JSON.stringify(next));
      try {
        window.parent.postMessage({ type: "__edit_mode_set_keys", edits: typeof key === "object" ? key : { [key]: val } }, "*");
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    window.TT_TOKENS.applyTokens(tweaks);
  }, [tweaks]);

  useEffect(() => {
    window.location.hash = "#/" + screen;
    localStorage.setItem("tt-screen", screen);
  }, [screen]);

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#/", "");
      if (flatScreens.find((s) => s.k === h) && h !== screen) setScreen(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [screen]);

  const activeScreen = flatScreens.find((s) => s.k === screen) || flatScreens[0];

  const onNavigate = useCallback((k) => {
    if (flatScreens.find((s) => s.k === k)) setScreen(k);
  }, []);

  const onToggleMode = useCallback(() => {
    setTweak("mode", tweaks.mode === "dark" ? "light" : "dark");
  }, [tweaks.mode, setTweak]);

  const screenProps = {
    direction: tweaks.direction,
    mode: tweaks.mode,
    density: tweaks.density,
    onToggleMode,
    onNavigate,
    orgName: "Onyeka Provision Stores",
    userName: "Amaka",
    userRole: "business_owner",
  };

  return (
    <div>
      {/* Direction switcher */}
      <div className="tt-dirbar">
        {DIRECTIONS_ARR.map((d) => (
          <div
            key={d.k}
            className="tt-dirbar-item"
            data-active={tweaks.direction === d.k}
            onClick={() => setTweak("direction", d.k)}
            title={window.TT_TOKENS.DIRECTIONS[d.k].tagline}
          >
            {d.l}
          </div>
        ))}
      </div>

      {/* Screen selector */}
      <ScreenBar screens={SCREENS} active={screen} onSelect={onNavigate} />

      {/* Live screen */}
      <div key={screen + tweaks.direction + tweaks.mode}>
        {activeScreen.C(screenProps)}
      </div>

      {/* Tweaks */}
      <TweaksPanel title="Tweaks" initialCollapsed={true}>
        <TweakSection title="Direction">
          <TweakRadio label="Style" value={tweaks.direction} onChange={(v) => setTweak("direction", v)} options={[
            { value: "ledger", label: "Ledger" },
            { value: "market", label: "Market" },
            { value: "operator", label: "Operator" },
            { value: "retail", label: "Retail" },
          ]} />
          <TweakRadio label="Mode" value={tweaks.mode} onChange={(v) => setTweak("mode", v)} options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]} />
        </TweakSection>

        <TweakSection title="Layout">
          <TweakSelect label="Density" value={tweaks.density} onChange={(v) => setTweak("density", v)} options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "balanced", label: "Balanced (default)" },
            { value: "dense", label: "Dense" },
          ]} />
          <TweakSlider label="Radius" value={tweaks.radiusOverride ?? window.TT_TOKENS.DIRECTIONS[tweaks.direction].radius} min={0} max={24} step={1} onChange={(v) => setTweak("radiusOverride", v)} />
          <TweakButton label="Reset radius to direction default" onClick={() => setTweak("radiusOverride", null)} />
        </TweakSection>

        <TweakSection title="Primary color override">
          <TweakColor label="Primary" value={tweaks.primaryOverride || window.TT_TOKENS.DIRECTIONS[tweaks.direction][tweaks.mode].primary} onChange={(v) => setTweak("primaryOverride", v)}
            options={["oklch(0.28 0.14 265)", "oklch(0.42 0.11 155)", "oklch(0.52 0.22 255)", "oklch(0.6 0.16 40)", "oklch(0.2 0.02 250)"]} />
          <TweakButton label="Reset primary to direction default" onClick={() => setTweak("primaryOverride", "")} />
        </TweakSection>

        <TweakSuggestionBar suggestions={[
          "I like the Ledger direction — refine the marketing site.",
          "Explore a Market × Ledger hybrid: Market colors, Ledger typography.",
          "Ship Operator direction across the whole app.",
          "Combine POS from Retail with dashboard from Operator.",
          "This proposal is approved. Start implementing across the codebase.",
        ]} />
      </TweaksPanel>
    </div>
  );
}

/* Screen picker rail on the left, grouped */
function ScreenBar({ screens, active, onSelect }) {
  return (
    <div className="tt-screenbar">
      {screens.map((group) => {
        const open = group.items.some((i) => i.k === active) || group.g === "Marketing";
        return (
          <details key={group.g} open={open}>
            <summary>{group.g} · {group.items.length}</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, marginBottom: 4 }}>
              {group.items.map((it) => (
                <div key={it.k} className="tt-screenbar-item" data-active={active === it.k} onClick={() => onSelect(it.k)}>
                  {it.l}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/* Boot */
const rootEl = document.getElementById("root");
ReactDOM.createRoot(rootEl).render(<App />);
