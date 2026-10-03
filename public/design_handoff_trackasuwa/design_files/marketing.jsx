/* Marketing pages — Landing / Features / Pricing / Download / Industries.
 * Photography-rich, entrance & scroll animations, direction-aware hero copy. */

const { useState: mUseState, useEffect: mUseEffect, useRef: mUseRef } = React;

/* ─── Scroll reveal — animates children into view ─── */
function useInView(threshold = 0.05) {
  const ref = mUseRef(null);
  const [seen, setSeen] = mUseState(false);
  mUseEffect(() => {
    if (!ref.current) return;
    // Check if element is already visible at mount
    const rect = ref.current.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight + 200 && rect.bottom > -200;
    if (inViewport) { setSeen(true); return; }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setSeen(true); obs.disconnect(); } },
      { threshold, rootMargin: "0px 0px 200px 0px" }
    );
    obs.observe(ref.current);
    // Safety fallback: reveal after 1.2s regardless
    const fallback = setTimeout(() => setSeen(true), 1200);
    return () => { obs.disconnect(); clearTimeout(fallback); };
  }, [threshold]);
  return [ref, seen];
}
function Reveal({ children, delay = 0, y = 24, as = "div", className = "", style = {} }) {
  const [ref, seen] = useInView();
  const Tag = as;
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: seen ? 1 : 0,
        transform: seen ? "translateY(0)" : `translateY(${y}px)`,
        transition: `opacity 700ms cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 700ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}

/* ─── Parallax scroll for hero images ─── */
function useScrollY() {
  const [y, setY] = mUseState(0);
  mUseEffect(() => {
    let raf;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setY(window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return y;
}

/* ─── Marquee for logos ─── */
function LogoMarquee({ items }) {
  const doubled = [...items, ...items];
  return (
    <div style={{ overflow: "hidden", position: "relative", maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
      <div style={{ display: "inline-flex", gap: 60, animation: "tt-marquee 30s linear infinite", whiteSpace: "nowrap" }}>
        {doubled.map((n, i) => (
          <div key={i} style={{ fontFamily: "var(--font-head)", fontSize: 16, letterSpacing: "0.02em", color: "var(--c-textMuted)", opacity: 0.7, flexShrink: 0 }}>{n}</div>
        ))}
      </div>
    </div>
  );
}

function MarketingNav({ direction, mode, onToggleMode, active, onNavigate }) {
  const items = [
    { key: "landing", label: "Home" },
    { key: "features", label: "Features" },
    { key: "industries", label: "Industries" },
    { key: "pricing", label: "Pricing" },
    { key: "download", label: "Download" },
  ];
  const scrollY = useScrollY();
  const scrolled = scrollY > 20;
  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 20,
      background: scrolled ? "color-mix(in oklch, var(--c-bg), transparent 15%)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? "1px solid var(--c-border)" : "1px solid transparent",
      transition: "all 300ms",
    }}>
      <div className="tt-marketing-wrap" style={{ display: "flex", alignItems: "center", height: 72, gap: 24 }}>
        <div onClick={() => onNavigate("landing")} style={{ cursor: "pointer" }}>
          <Logo direction={direction} size={30} />
        </div>
        <div style={{ display: "flex", gap: 2, flex: 1, marginLeft: 24 }}>
          {items.map((it) => (
            <button key={it.key} className="tt-btn tt-btn-ghost" onClick={() => onNavigate(it.key)}
              style={{ color: active === it.key ? "var(--c-text)" : "var(--c-textMuted)", fontWeight: active === it.key ? 600 : 500 }}
            >{it.label}</button>
          ))}
        </div>
        <button className="tt-btn tt-btn-ghost tt-btn-icon" onClick={onToggleMode}>
          {mode === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
        </button>
        <button className="tt-btn tt-btn-secondary" onClick={() => onNavigate("auth-login")}>Sign in</button>
        <button className="tt-btn tt-btn-primary" onClick={() => onNavigate("auth-signup")}>Start free <IconArrowRight size={14} /></button>
      </div>
    </nav>
  );
}

/* Direction-specific hero copy */
const HERO_COPY = {
  ledger: {
    eyebrow: "Enterprise POS · Made for Nigeria",
    title: "Run your shop like a bank runs its books.",
    sub: "Multi-warehouse inventory, offline-first POS, dedicated Zainpay virtual accounts, and immutable audit trails. Trusted infrastructure for Nigerian traders — from a market stall to a chain of hotels.",
  },
  market: {
    eyebrow: "Your market. Your money. Your control.",
    title: "The shopkeeper's ledger, reimagined.",
    sub: "From Balogun to Onitsha — sell, restock, and settle across every branch. Offline-ready, Naira-native, and built to grow with your trade.",
  },
  operator: {
    eyebrow: "Modern retail & hospitality infrastructure",
    title: "Retail operations, without the drag.",
    sub: "One platform for POS, inventory, purchase orders, production and multi-org accounting. Fast. Keyboard-first. Priced for the Nigerian market.",
  },
  retail: {
    eyebrow: "Point of Sale · Nigeria",
    title: "Sell faster. Restock smarter. Never lose a sale.",
    sub: "Barcode-scan checkout, split payments, offline-ready — plus a dedicated Naira account for every merchant. TradeTrack is retail, unlocked.",
  },
};

/* ─── Animated Hero — split-screen with photo & app mockup ─── */
function Hero({ direction, onNavigate }) {
  const c = HERO_COPY[direction] || HERO_COPY.ledger;
  const scrollY = useScrollY();
  const py = Math.min(scrollY * 0.15, 60);
  return (
    <section style={{ position: "relative", overflow: "hidden", paddingTop: 60, paddingBottom: 100 }}>
      {/* Animated blobs */}
      <div className="tt-blob tt-blob-float-1" style={{ top: -100, right: -80, width: 500, height: 500, background: "var(--c-primary)" }} />
      <div className="tt-blob tt-blob-float-2" style={{ top: 200, left: -80, width: 400, height: 400, background: "var(--c-accent)", opacity: 0.3 }} />

      <div className="tt-marketing-wrap" style={{ position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 64, alignItems: "center" }}>
          <div>
            <Reveal delay={100}>
              <div className="tt-eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--c-surfaceAlt)", borderRadius: 999, border: "1px solid var(--c-border)", marginBottom: 20 }}>
                <span className="tt-dot-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--c-success)" }} />
                {c.eyebrow}
              </div>
            </Reveal>

            <Reveal delay={200}>
              <h1 className="tt-head" style={{ fontSize: 68, margin: "0 0 20px", maxWidth: 640, lineHeight: 1.02 }}>{c.title}</h1>
            </Reveal>

            <Reveal delay={350}>
              <p style={{ fontSize: 18, lineHeight: 1.55, color: "var(--c-textMuted)", margin: "0 0 32px", maxWidth: 540 }}>{c.sub}</p>
            </Reveal>

            <Reveal delay={500}>
              <div className="tt-flex">
                <button className="tt-btn tt-btn-primary tt-btn-lg" onClick={() => onNavigate("auth-signup")}>
                  Start free — no card <IconArrowRight size={16} />
                </button>
                <button className="tt-btn tt-btn-secondary tt-btn-lg" onClick={() => onNavigate("download")}>
                  <IconDownload size={16} /> Download for Windows
                </button>
              </div>
            </Reveal>

            <Reveal delay={650}>
              <div style={{ display: "flex", gap: 24, marginTop: 32, alignItems: "center", flexWrap: "wrap" }}>
                {[
                  "Free plan forever",
                  "Offline-ready",
                  "Works on any phone",
                ].map((c) => (
                  <div key={c} className="tt-flex" style={{ alignItems: "center", gap: 6 }}>
                    <IconCheck size={14} style={{ color: "var(--c-success)" }} />
                    <span style={{ fontSize: 13, color: "var(--c-textMuted)" }}>{c}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <div style={{ transform: `translateY(${-py * 0.3}px)`, position: "relative" }}>
            <HeroCompositePhoto />
          </div>
        </div>
      </div>

      <Reveal delay={800}>
        <div className="tt-marketing-wrap" style={{ marginTop: 100 }}>
          <div className="tt-eyebrow" style={{ color: "var(--c-textFaint)", marginBottom: 24, textAlign: "center" }}>Trusted by 12,400+ traders, restaurateurs & merchants across Nigeria</div>
          <LogoMarquee items={["Aliko Stores", "Umeh & Sons", "Mama Nkechi", "Balogun Textiles", "Kano Grains", "Chuka Auto Parts", "Kilimanjaro Kitchen", "Nikkoos Bakery", "Onyeka Provisions", "Lekki Grand Hotel", "Abuja Foodhall"]} />
        </div>
      </Reveal>
    </section>
  );
}

/* Hero visual — photo of trader + app mockup card overlay */
function HeroCompositePhoto() {
  return (
    <div style={{ position: "relative", aspectRatio: "1 / 1.05" }}>
      {/* Main photo card */}
      <div className="tt-card tt-hero-photo" style={{ padding: 0, overflow: "hidden", position: "absolute", inset: 0, boxShadow: "0 40px 100px -20px color-mix(in oklch, var(--c-primary), transparent 75%)" }}>
        <div style={{ width: "100%", height: "100%", backgroundImage: "url('assets/photo-aba-traders.jpg')", backgroundSize: "cover", backgroundPosition: "center" }} />
      </div>

      {/* Floating dashboard mockup */}
      <div className="tt-card tt-hero-mockup" style={{ position: "absolute", left: -40, bottom: -30, width: 280, padding: 0, overflow: "hidden", boxShadow: "0 30px 60px -15px color-mix(in oklch, var(--c-primary), transparent 70%)" }}>
        <div style={{ padding: "8px 12px", background: "var(--c-surfaceAlt)", borderBottom: "1px solid var(--c-border)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "#ff5f56" }} />
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "#ffbd2e" }} />
          <span style={{ width: 7, height: 7, borderRadius: 999, background: "#27c93f" }} />
          <span className="tt-mono" style={{ marginLeft: 6, fontSize: 9, color: "var(--c-textMuted)" }}>tradetrack.ng</span>
        </div>
        <div style={{ padding: 14, background: "var(--c-surface)" }}>
          <div style={{ fontSize: 10, color: "var(--c-textMuted)" }}>Today · Aba HQ</div>
          <div className="tt-head" style={{ fontSize: 26, marginTop: 2, lineHeight: 1 }}>₦482,190</div>
          <div style={{ fontSize: 10, color: "var(--c-success)", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
            <IconArrowUp size={9} /> +18% vs yesterday
          </div>
          <MiniBars />
        </div>
      </div>

      {/* Floating live-sale toast */}
      <div className="tt-card tt-hero-toast" style={{ position: "absolute", right: -20, top: 40, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.15)" }}>
        <div style={{ width: 32, height: 32, borderRadius: 999, background: "color-mix(in oklch, var(--c-success), transparent 82%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconCheck size={16} style={{ color: "var(--c-success)" }} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Sale complete</div>
          <div className="tt-mono" style={{ fontSize: 10, color: "var(--c-textMuted)" }}>₦14,500 · Cash · #A00248</div>
        </div>
      </div>

      {/* Floating stat pill */}
      <div className="tt-card tt-hero-pill" style={{ position: "absolute", left: 30, top: -20, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.15)" }}>
        <span className="tt-dot-pulse" style={{ width: 8, height: 8, borderRadius: 999, background: "var(--c-success)" }} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>147 sales today</span>
      </div>
    </div>
  );
}

function MiniBars() {
  const values = [12, 20, 15, 28, 32, 24, 38];
  const max = Math.max(...values);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40, marginTop: 8 }}>
      {values.map((v, i) => (
        <div key={i} className="tt-bar-grow" style={{ flex: 1, background: `color-mix(in oklch, var(--c-primary), transparent ${75 - v}%)`, height: `${(v / max) * 100}%`, borderRadius: 2, animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

/* Stats band — animated counters */
function StatsBand() {
  return (
    <section style={{ padding: "80px 0", borderTop: "1px solid var(--c-border)", borderBottom: "1px solid var(--c-border)" }}>
      <div className="tt-marketing-wrap">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40 }}>
          {[
            { n: "12,400+", l: "Merchants onboard" },
            { n: "₦4.2B", l: "Processed this year" },
            { n: "99.9%", l: "Uptime SLA" },
            { n: "5×", l: "Cheaper than legacy POS" },
          ].map((s, i) => (
            <Reveal key={s.l} delay={i * 100}>
              <div>
                <div className="tt-head" style={{ fontSize: 52, color: "var(--c-primary)", lineHeight: 1 }}>{s.n}</div>
                <div className="tt-muted" style={{ fontSize: 14, marginTop: 8 }}>{s.l}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Feature grid — with photo-backed featured card */
const FEATURES = [
  { Icon: IconCart, title: "Fast checkout POS", desc: "Barcode scanning, split payments, discounts, tax rules and receipts. Works with any USB or Bluetooth thermal printer." },
  { Icon: IconWifiOff, title: "Offline-first, truly", desc: "Sell without internet. Every sale, price change and stock movement queues locally and syncs when you're back online." },
  { Icon: IconWarehouse, title: "Multi-warehouse inventory", desc: "Track stock across shops. Transfer between warehouses with signed receipts. See every movement in the audit trail." },
  { Icon: IconCard, title: "Zainpay Naira accounts", desc: "Every merchant gets a dedicated NUBAN. Subscription payments auto-reconcile via secure webhooks." },
  { Icon: IconClipboard, title: "Purchase orders", desc: "Create, send and receive POs. Inventory updates the moment you receive. Full paper trail for suppliers." },
  { Icon: IconChart, title: "Reports that decide", desc: "Daily, weekly, monthly, quarterly and yearly. Export PDF, Excel or CSV. Data you can bring to your bank." },
];

function FeatureGrid({ direction, onNavigate }) {
  return (
    <section style={{ padding: "100px 0", background: "var(--c-bgAlt)" }}>
      <div className="tt-marketing-wrap">
        <Reveal>
          <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Everything you need. Nothing you don't.</div>
          <h2 className="tt-head" style={{ fontSize: 48, margin: "0 0 12px", maxWidth: 780, lineHeight: 1.05 }}>Built by shopkeepers, for shopkeepers.</h2>
          <p style={{ fontSize: 17, color: "var(--c-textMuted)", maxWidth: 620, marginBottom: 60 }}>Every feature earned its place by solving a real problem for a real trader. If it wasn't shipped, it isn't listed.</p>
        </Reveal>

        {/* Featured card with photo */}
        <Reveal delay={100}>
          <div className="tt-card" style={{ padding: 0, overflow: "hidden", marginBottom: 24, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: 60, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div className="tt-badge tt-badge-primary" style={{ alignSelf: "flex-start", marginBottom: 20 }}>Flagship feature</div>
              <h3 className="tt-head" style={{ fontSize: 36, margin: "0 0 16px", lineHeight: 1.1 }}>Offline-first, truly. Sell even when the network doesn't.</h3>
              <p style={{ fontSize: 15, color: "var(--c-textMuted)", lineHeight: 1.6, marginBottom: 28 }}>
                Every sale, price change and stock movement queues on-device in IndexedDB. When your connection returns, we sync it — <em>append-only</em> for sales, last-write-wins for everything else. No lost transactions. Ever.
              </p>
              <div style={{ display: "flex", gap: 32 }}>
                {[
                  { n: "0", l: "Sales lost" },
                  { n: "84×", l: "Aba shop record" },
                  { n: "180ms", l: "Sync latency" },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="tt-head" style={{ fontSize: 24, color: "var(--c-primary)" }}>{s.n}</div>
                    <div className="tt-muted" style={{ fontSize: 11 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ position: "relative", minHeight: 380, backgroundImage: "url('assets/photo-testimonial-nigerian-woman.jpg')", backgroundSize: "cover", backgroundPosition: "center" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, var(--c-surface) 0%, transparent 30%)" }} />
              {/* Overlay POS card */}
              <div className="tt-card" style={{ position: "absolute", right: 30, bottom: 30, padding: 16, width: 240, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span className="tt-badge tt-badge-warn"><IconWifiOff size={10} /> Offline</span>
                  <span className="tt-mono tt-muted" style={{ fontSize: 10 }}>4 queued</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--c-textMuted)" }}>Current sale</div>
                <div className="tt-head" style={{ fontSize: 28, marginTop: 2 }}>₦14,500</div>
                <button className="tt-btn tt-btn-primary" style={{ width: "100%", marginTop: 10, height: 40 }}>Charge ₦14,500</button>
              </div>
            </div>
          </div>
        </Reveal>

        <div className="tt-grid tt-grid-3" style={{ gap: 20 }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 60}>
              <div className="tt-card tt-feature-card" style={{ padding: 28, height: "100%" }}>
                <div style={{ width: 44, height: 44, borderRadius: "var(--radius)", background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                  <f.Icon size={22} />
                </div>
                <div className="tt-head" style={{ fontSize: 20, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 14, color: "var(--c-textMuted)", lineHeight: 1.55 }}>{f.desc}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Industries showcase — the new Production/Manufacturing preview */
const INDUSTRIES = [
  { key: "retail", label: "Retail & wholesale", desc: "Provision stores, textiles, auto parts, electronics.", photo: "assets/photo-market.jpg", icon: IconStore, live: true },
  { key: "restaurants", label: "Restaurants & lounges", desc: "Menu, KDS, table-side ordering, ingredient depletion.", photo: "assets/photo-restaurant.jpg", icon: IconLayers, live: false, badge: "Extension" },
  { key: "bakeries", label: "Bakeries & production", desc: "Recipes, batches, cost of goods, expiry tracking.", photo: "assets/photo-bakery.jpg", icon: IconPackage, live: false, badge: "Extension" },
  { key: "hotels", label: "Hotels & hospitality", desc: "Rooms, check-in, folios, restaurant, mini-bar rollup.", photo: "assets/photo-african-hotel-women.jpg", icon: IconBuilding, live: false, badge: "Extension" },
  { key: "malls", label: "Shopping malls", desc: "Multi-tenant, mall-wide dashboards, unified reporting.", photo: "assets/photo-mall.jpg", icon: IconGrid, live: false, badge: "Extension" },
  { key: "grocery", label: "Grocery stores", desc: "SKU velocity, fresh produce, shelf-life & waste tracking.", photo: "assets/photo-african-spices-market.jpg", icon: IconCart, live: true },
];

function IndustriesBand({ onNavigate }) {
  return (
    <section style={{ padding: "100px 0" }}>
      <div className="tt-marketing-wrap">
        <Reveal>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48, gap: 40 }}>
            <div>
              <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Industries · one platform</div>
              <h2 className="tt-head" style={{ fontSize: 48, margin: 0, maxWidth: 640, lineHeight: 1.05 }}>Beyond retail — now for restaurants, hotels, bakeries & malls.</h2>
            </div>
            <p style={{ fontSize: 15, color: "var(--c-textMuted)", maxWidth: 380, lineHeight: 1.6 }}>Our new <b>Production & Hospitality</b> extension layers on top of the core platform. Same login, same audit trail — new superpowers.</p>
          </div>
        </Reveal>

        <div className="tt-grid tt-grid-3" style={{ gap: 20 }}>
          {INDUSTRIES.map((ind, i) => (
            <Reveal key={ind.key} delay={i * 80}>
              <div className="tt-card tt-industry-card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }} onClick={() => onNavigate("industries")}>
                <div style={{ aspectRatio: "16 / 10", backgroundImage: `url('${ind.photo}')`, backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.5) 100%)" }} />
                  {ind.badge && (
                    <div style={{ position: "absolute", top: 14, left: 14 }}>
                      <span className="tt-badge tt-badge-solid" style={{ background: "var(--c-accent)", color: "var(--c-accentFg)" }}>{ind.badge}</span>
                    </div>
                  )}
                  <div style={{ position: "absolute", right: 14, top: 14, width: 40, height: 40, borderRadius: "var(--radius)", background: "rgba(255,255,255,0.9)", color: "var(--c-primary)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)" }}>
                    <ind.icon size={20} />
                  </div>
                </div>
                <div style={{ padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div className="tt-head" style={{ fontSize: 20 }}>{ind.label}</div>
                    {ind.live && <span className="tt-badge tt-badge-success">Available</span>}
                  </div>
                  <div className="tt-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>{ind.desc}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Testimonials — with real photos */
const TESTIMONIALS = [
  { q: "Before TradeTrack we used exercise books. Now I know my best-selling SKU by 10am each day.", who: "Amaka Onyeka", role: "Onyeka Provision Stores · Aba", photo: "assets/photo-testimonial-african-corp-woman.jpg" },
  { q: "The offline mode saved us during the network cut. We rang up 84 sales, everything synced when NEPA came back.", who: "Ibrahim Musa", role: "Musa & Sons Grains · Kano", photo: "assets/photo-testimonial-man1.jpg" },
  { q: "The restaurant module is a game-changer. Kitchen sees orders live, ingredients deplete automatically. We stopped losing money on wastage.", who: "Tunde Ojo", role: "Kilimanjaro Kitchen · Lekki", photo: "assets/photo-testimonial-african-man-restaurant.jpg" },
];

function Testimonials() {
  return (
    <section style={{ padding: "100px 0", background: "var(--c-bgAlt)" }}>
      <div className="tt-marketing-wrap">
        <Reveal>
          <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Loved by operators</div>
          <h2 className="tt-head" style={{ fontSize: 44, margin: "0 0 60px", maxWidth: 620, lineHeight: 1.05 }}>Real businesses. Real numbers. Real time saved.</h2>
        </Reveal>

        <div className="tt-grid tt-grid-3" style={{ gap: 20 }}>
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={i} delay={i * 100}>
              <div className="tt-card" style={{ padding: 0, overflow: "hidden", height: "100%" }}>
                <div style={{ aspectRatio: "4/3", backgroundImage: `url('${t.photo}')`, backgroundSize: "cover", backgroundPosition: "center top" }} />
                <div style={{ padding: 28 }}>
                  <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
                    {[1,2,3,4,5].map((s) => <IconStar key={s} size={14} style={{ color: "var(--c-accent)", fill: "var(--c-accent)" }} />)}
                  </div>
                  <div style={{ fontSize: 16, lineHeight: 1.55, color: "var(--c-text)", marginBottom: 20, fontFamily: "var(--font-head)", fontWeight: 400 }}>"{t.q}"</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.who}</div>
                    <div style={{ fontSize: 11, color: "var(--c-textMuted)", marginTop: 2 }}>{t.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTABand({ onNavigate }) {
  return (
    <section style={{ padding: "100px 0" }}>
      <div className="tt-marketing-wrap">
        <Reveal>
          <div className="tt-card" style={{ padding: 80, textAlign: "center", background: "var(--c-primary)", color: "var(--c-primaryFg)", borderColor: "transparent", position: "relative", overflow: "hidden" }}>
            <div className="tt-blob tt-blob-float-1" style={{ top: -80, right: -80, width: 400, height: 400, background: "var(--c-accent)", opacity: 0.35 }} />
            <div className="tt-blob tt-blob-float-2" style={{ bottom: -80, left: -80, width: 350, height: 350, background: "var(--c-primaryFg)", opacity: 0.05 }} />
            <h2 className="tt-head" style={{ fontSize: 56, margin: "0 0 16px", position: "relative", lineHeight: 1.05 }}>Start selling smarter today.</h2>
            <p style={{ fontSize: 18, opacity: 0.85, maxWidth: 560, margin: "0 auto 36px", position: "relative" }}>Free forever for one shop. Upgrade when your business does. No card required to start.</p>
            <div className="tt-flex" style={{ justifyContent: "center", position: "relative" }}>
              <button className="tt-btn tt-btn-lg" onClick={() => onNavigate("auth-signup")} style={{ background: "var(--c-primaryFg)", color: "var(--c-primary)" }}>
                Create your merchant account <IconArrowRight size={16} />
              </button>
              <button className="tt-btn tt-btn-lg tt-btn-ghost" onClick={() => onNavigate("pricing")} style={{ color: "var(--c-primaryFg)", border: "1px solid color-mix(in oklch, var(--c-primaryFg), transparent 70%)" }}>See pricing</button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer({ direction }) {
  return (
    <footer style={{ padding: "60px 0 32px", borderTop: "1px solid var(--c-border)" }}>
      <div className="tt-marketing-wrap">
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 40, marginBottom: 48 }}>
          <div>
            <Logo direction={direction} size={30} />
            <p style={{ fontSize: 13, color: "var(--c-textMuted)", marginTop: 16, maxWidth: 320, lineHeight: 1.6 }}>
              Enterprise POS, inventory, production & hospitality for Nigerian businesses. Made in Lagos, deployed everywhere.
            </p>
          </div>
          {[
            { t: "Product", l: ["Features", "Industries", "Pricing", "Download", "Changelog"] },
            { t: "Merchants", l: ["Sign in", "Sign up", "Help center", "Contact sales"] },
            { t: "Legal", l: ["Privacy", "Terms", "Security", "Refunds"] },
          ].map((col) => (
            <div key={col.t}>
              <div className="tt-eyebrow" style={{ marginBottom: 12 }}>{col.t}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {col.l.map((x) => <a key={x} style={{ fontSize: 13, color: "var(--c-textMuted)", textDecoration: "none", cursor: "pointer" }}>{x}</a>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 24, borderTop: "1px solid var(--c-border)" }}>
          <div style={{ fontSize: 12, color: "var(--c-textFaint)" }}>© 2026 TradeTrack Nigeria Ltd. All rights reserved.</div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--c-textFaint)" }}>
            <span>Made in Lagos 🇳🇬</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* Landing page */
function Landing(props) {
  return (
    <div className="tt-marketing">
      <MarketingNav {...props} active="landing" />
      <Hero {...props} />
      <StatsBand />
      <FeatureGrid {...props} />
      <IndustriesBand {...props} />
      <Testimonials />
      <CTABand {...props} />
      <Footer {...props} />
    </div>
  );
}

/* Features page */
function Features(props) {
  const categories = [
    { title: "Point of Sale", Icon: IconCart, items: ["Barcode scanner (USB/Bluetooth/camera)", "Split payments · cash + card + transfer", "Discounts, tax rules, price overrides", "Thermal receipt printing (80mm & 58mm)", "Receipt lookup by barcode / QR / number"] },
    { title: "Inventory & Warehousing", Icon: IconWarehouse, items: ["Multi-warehouse stock levels & movement history", "Inter-warehouse transfers with signed receipts", "Vendor consignment tracking", "Purchase orders — create → send → receive", "Immutable audit trail on every write"] },
    { title: "Production & Hospitality (Extension)", Icon: IconLayers, items: ["Recipes, batches, cost of goods & yield", "Kitchen Display System (KDS) for restaurants", "Table & floor management", "Hotel folios: rooms, F&B, minibar rollup", "Multi-tenant mall management"] },
    { title: "Payments & Billing", Icon: IconCard, items: ["Dedicated Zainpay NUBAN per merchant", "Webhook-based auto-reconciliation", "5-tier subscription ladder + Extension packs", "Naira-native pricing across the app"] },
    { title: "Roles & Security", Icon: IconShield, items: ["4 roles + custom permissions on Business+", "Row-level security on every table", "Forced password change on first login", "JWT session tokens · immutable audit"] },
    { title: "Offline & Distribution", Icon: IconWifiOff, items: ["IndexedDB-backed offline cache", "Background sync engine with conflict rules", "Installable PWA — iOS, Android, Windows, Mac", "Native Windows .exe & Android .apk shells"] },
  ];
  return (
    <div className="tt-marketing">
      <MarketingNav {...props} active="features" />
      <section style={{ padding: "100px 0 40px" }}>
        <div className="tt-marketing-wrap">
          <Reveal><div className="tt-eyebrow" style={{ marginBottom: 12 }}>Features</div></Reveal>
          <Reveal delay={100}><h1 className="tt-head" style={{ fontSize: 64, margin: "0 0 20px", maxWidth: 900, lineHeight: 1.05 }}>Every capability, honestly documented.</h1></Reveal>
          <Reveal delay={200}><p style={{ fontSize: 18, color: "var(--c-textMuted)", maxWidth: 620 }}>We ship this list — not aspirational marketing. What's not built yet is either coming soon, or hidden until it is.</p></Reveal>
        </div>
      </section>
      <section style={{ padding: "0 0 100px" }}>
        <div className="tt-marketing-wrap">
          <div className="tt-grid tt-grid-2" style={{ gap: 24 }}>
            {categories.map((cat, i) => (
              <Reveal key={cat.title} delay={i * 80}>
                <div className="tt-card" style={{ padding: 36, height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
                    <div style={{ width: 48, height: 48, borderRadius: "var(--radius)", background: "var(--c-primary)", color: "var(--c-primaryFg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <cat.Icon size={24} />
                    </div>
                    <h3 className="tt-head" style={{ fontSize: 22, margin: 0 }}>{cat.title}</h3>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                    {cat.items.map((it) => (
                      <li key={it} style={{ display: "flex", gap: 10, fontSize: 14, color: "var(--c-text)" }}>
                        <IconCheck size={14} style={{ color: "var(--c-success)", marginTop: 4, flexShrink: 0 }} />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <CTABand {...props} />
      <Footer {...props} />
    </div>
  );
}

/* Pricing page */
const PLANS = [
  { name: "Free", price: 0, blurb: "For a single shop finding its feet.", limits: ["1 shop", "50 products", "2 users", "Basic reports"], primary: false },
  { name: "Starter", price: 3500, blurb: "Growing shop, single location.", limits: ["1 shop", "500 products", "5 users", "PDF/Excel reports", "Barcode POS"], primary: false },
  { name: "Growth", price: 7500, blurb: "Multi-branch, real momentum.", limits: ["3 shops", "5,000 products", "15 users", "Transfers & consignment", "Priority sync"], primary: true },
  { name: "Business", price: 18000, blurb: "Serious operations, real teams.", limits: ["10 shops", "Unlimited products", "50 users", "Purchase Orders", "Custom roles"], primary: false },
  { name: "Enterprise", price: null, blurb: "For nationwide chains & distributors.", limits: ["Unlimited shops", "Unlimited users", "SSO & audit exports", "Dedicated CSM", "SLA & migration"], primary: false },
];

function Pricing(props) {
  return (
    <div className="tt-marketing">
      <MarketingNav {...props} active="pricing" />
      <section style={{ padding: "100px 0 40px", textAlign: "center" }}>
        <div className="tt-marketing-wrap">
          <Reveal><div className="tt-eyebrow" style={{ marginBottom: 12 }}>Pricing</div></Reveal>
          <Reveal delay={100}><h1 className="tt-head" style={{ fontSize: 64, margin: "0 0 20px", lineHeight: 1.05 }}>Pay in Naira. Grow when you grow.</h1></Reveal>
          <Reveal delay={200}><p style={{ fontSize: 18, color: "var(--c-textMuted)", maxWidth: 620, margin: "0 auto 40px" }}>Every plan works offline, comes with your own Zainpay account, and includes the Windows & Android apps.</p></Reveal>
          <Reveal delay={300}>
            <div className="tt-seg" style={{ margin: "0 auto" }}>
              <div className="tt-seg-item" data-active="true">Monthly</div>
              <div className="tt-seg-item">Yearly · save 20%</div>
            </div>
          </Reveal>
        </div>
      </section>
      <section style={{ padding: "20px 0 60px" }}>
        <div className="tt-marketing-wrap">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, alignItems: "stretch" }}>
            {PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 80}>
                <div className="tt-card" style={{
                  padding: 24, display: "flex", flexDirection: "column", gap: 16, height: "100%",
                  border: p.primary ? "2px solid var(--c-primary)" : "1px solid var(--c-border)",
                  position: "relative",
                  background: p.primary ? "color-mix(in oklch, var(--c-primary), transparent 95%)" : "var(--c-surface)",
                }}>
                  {p.primary && <span className="tt-badge tt-badge-solid" style={{ position: "absolute", top: -12, left: 24 }}>Most popular</span>}
                  <div>
                    <div className="tt-head" style={{ fontSize: 22 }}>{p.name}</div>
                    <div className="tt-muted" style={{ fontSize: 12, marginTop: 4, minHeight: 32 }}>{p.blurb}</div>
                  </div>
                  <div>
                    {p.price === 0 && <div className="tt-head" style={{ fontSize: 40 }}>Free</div>}
                    {p.price && <div className="tt-head" style={{ fontSize: 40 }}>₦{p.price.toLocaleString()}<span className="tt-muted" style={{ fontSize: 12, fontWeight: 400, fontFamily: "var(--font-body)", letterSpacing: "normal" }}>/mo</span></div>}
                    {p.price === null && <div className="tt-head" style={{ fontSize: 30 }}>Custom</div>}
                  </div>
                  <button className={`tt-btn ${p.primary ? "tt-btn-primary" : "tt-btn-secondary"}`}>{p.price === null ? "Talk to sales" : "Start free"}</button>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                    {p.limits.map((l) => (
                      <li key={l} style={{ display: "flex", gap: 8 }}>
                        <IconCheck size={13} style={{ color: "var(--c-success)", marginTop: 3, flexShrink: 0 }} />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Extension packs */}
      <section style={{ padding: "40px 0 100px" }}>
        <div className="tt-marketing-wrap">
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <div className="tt-eyebrow" style={{ marginBottom: 12 }}>Extension packs · add to any plan</div>
              <h2 className="tt-head" style={{ fontSize: 40, margin: 0 }}>Unlock production & hospitality modules.</h2>
              <p className="tt-muted" style={{ fontSize: 15, maxWidth: 620, margin: "12px auto 0" }}>Layer on top of any base plan. Only pay for the module you need.</p>
            </div>
          </Reveal>
          <div className="tt-grid tt-grid-4" style={{ gap: 16 }}>
            {[
              { name: "Restaurant Pack", price: 5000, Icon: IconLayers, features: ["KDS + kitchen tickets", "Table & floor plans", "Menu modifiers & combos", "Ingredient depletion"] },
              { name: "Bakery / Production", price: 5000, Icon: IconPackage, features: ["Recipes & sub-recipes", "Batch & yield tracking", "Cost of goods", "Expiry alerts"] },
              { name: "Hotel Pack", price: 12000, Icon: IconBuilding, features: ["Room inventory", "Check-in / check-out", "Folios & billing", "F&B + minibar rollup"] },
              { name: "Mall Manager", price: 25000, Icon: IconGrid, features: ["Multi-tenant leases", "Utility metering", "Mall-wide reporting", "Ad & footfall analytics"] },
            ].map((e, i) => (
              <Reveal key={e.name} delay={i * 80}>
                <div className="tt-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "var(--radius)", background: "color-mix(in oklch, var(--c-accent), transparent 82%)", color: "var(--c-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <e.Icon size={20} />
                    </div>
                    <span className="tt-badge tt-badge-neutral">Add-on</span>
                  </div>
                  <div>
                    <div className="tt-head" style={{ fontSize: 18 }}>{e.name}</div>
                    <div className="tt-head" style={{ fontSize: 22, marginTop: 8 }}>+₦{e.price.toLocaleString()}<span className="tt-muted" style={{ fontSize: 11, fontFamily: "var(--font-body)", fontWeight: 400 }}>/mo</span></div>
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                    {e.features.map((f) => (
                      <li key={f} style={{ display: "flex", gap: 6 }}>
                        <IconCheck size={11} style={{ color: "var(--c-success)", marginTop: 3, flexShrink: 0 }} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={200}>
            <div className="tt-card" style={{ marginTop: 32, padding: 24, background: "var(--c-surfaceAlt)" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <IconInfo size={20} className="tt-muted" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>All plans include your own Zainpay Naira account</div>
                  <div className="tt-muted" style={{ fontSize: 13 }}>Dedicated NUBAN per merchant, webhook auto-reconciliation, and no per-transaction fee beyond Zainpay's.</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
      <Footer {...props} />
    </div>
  );
}

/* Download page */
function Download(props) {
  const platforms = [
    { name: "Windows", desc: "10 or later · .exe installer", size: "78 MB", Icon: IconTerminal, primary: true, badge: "Recommended for desktop" },
    { name: "Android", desc: "Android 8+ · sideload .apk", size: "14 MB", Icon: IconTouch, primary: false, badge: "Also available in any browser" },
    { name: "PWA", desc: "Install from any browser · iOS, macOS & everywhere else", size: "instant", Icon: IconGlobe, primary: false, badge: "Recommended for iOS" },
  ];
  return (
    <div className="tt-marketing">
      <MarketingNav {...props} active="download" />
      <section style={{ padding: "100px 0 40px", textAlign: "center" }}>
        <div className="tt-marketing-wrap">
          <Reveal><div className="tt-eyebrow" style={{ marginBottom: 12 }}>Download</div></Reveal>
          <Reveal delay={100}><h1 className="tt-head" style={{ fontSize: 64, margin: "0 0 20px", lineHeight: 1.05 }}>Get TradeTrack on every device you sell from.</h1></Reveal>
          <Reveal delay={200}><p style={{ fontSize: 18, color: "var(--c-textMuted)", maxWidth: 640, margin: "0 auto" }}>Every version syncs to the same account. Install on your shop desktop, your phone, and your tablet — one login, one inventory.</p></Reveal>
        </div>
      </section>
      <section style={{ padding: "20px 0 100px" }}>
        <div className="tt-marketing-wrap">
          <div className="tt-grid tt-grid-3">
            {platforms.map((p, i) => (
              <Reveal key={p.name} delay={i * 100}>
                <div className="tt-card" style={{ padding: 40, textAlign: "center", border: p.primary ? "2px solid var(--c-primary)" : "1px solid var(--c-border)", height: "100%" }}>
                  <div style={{ width: 72, height: 72, margin: "0 auto 20px", borderRadius: "var(--radius-lg)", background: "color-mix(in oklch, var(--c-primary), transparent 88%)", color: "var(--c-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <p.Icon size={36} />
                  </div>
                  <div className="tt-head" style={{ fontSize: 26, marginBottom: 8 }}>{p.name}</div>
                  <div className="tt-muted" style={{ fontSize: 13, marginBottom: 4 }}>{p.desc}</div>
                  <div className="tt-mono tt-faint" style={{ fontSize: 11, marginBottom: 24 }}>{p.size}</div>
                  <button className={`tt-btn ${p.primary ? "tt-btn-primary" : "tt-btn-secondary"} tt-btn-lg`} style={{ width: "100%" }}>
                    <IconDownload size={16} /> Download for {p.name}
                  </button>
                  <div className="tt-muted" style={{ fontSize: 11, marginTop: 12 }}>{p.badge}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <Footer {...props} />
    </div>
  );
}

Object.assign(window, { Landing, Features, Pricing, Download, MarketingNav, Reveal, useInView });
