/* Standalone design prototype. Synthetic data only. No network or application integration. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const key = "track-kasuwa-design-preview-v1";
  const base = {
    language: "en",
    theme: "light",
    width: "desktop",
    scenario: "normal",
    role: "Owner",
    plan: "Business",
    example: "oil",
    rows: [],
    revision: 1,
    stage: 0,
    tab: "file",
    selectedFile: "",
    paste: "",
    openRows: [],
    limits: {},
    outcome: "normal",
    rehearsal: "correct",
    authorizedRevision: null,
    offlineKind: "approval",
    appliedKeys: [],
    audit: [],
    chat: [],
    learned: [
      {
        id: 1,
        name: "Gino tomato paste",
        value: "1 carton = 50 sachets",
        kind: "Unit convention",
      },
      {
        id: 2,
        name: "Peak tin",
        value: "Peak Milk 400g",
        kind: "Product alias",
      },
      {
        id: 3,
        name: "A. Musa Trading",
        value: "Musa Wholesale · SUP-014",
        kind: "Supplier mapping",
      },
      {
        id: 4,
        name: "Stock-list Price column",
        value: "Read as selling price, not purchase cost",
        kind: "Past correction",
      },
    ],
    switches: {
      intake: true,
      insights: true,
      restock: true,
      analytics: true,
      staff: true,
    },
    sharing: { quality: false, aggregates: false, raw: false },
    saved: false,
    applied: false,
    changeAccepted: false,
  };
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(key) || "null");
  } catch (_) {}
  let s = { ...base, ...saved, limits: {}, openRows: saved?.openRows || [] };
  let rendering = false;
  let timer,
    priorFocus,
    lastRoute = "",
    toastTimer;
  const T = (en, ha) => (s.language === "ha" ? ha || en : en);
  const money = (n) =>
    "₦" + Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 });
  const store = () => {
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch (_) {}
  };
  const icon = (name = "stock") =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{ stock: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v8M7 5.8l10 5.6"/>', insight: '<path d="M4 20V10m8 10V4m8 16v-7"/>', file: '<path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>', arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', check: '<path d="m5 12 4 4L19 6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', chat: '<path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9Z"/><path d="M8 8h8m-8 5h5"/>', people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m0-16a3 3 0 0 1 0 6m3 4a6 6 0 0 1 3 6"/>', upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6"/>', lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>' }[name] || ""}</svg>`;
  const btn = (label, action, primary = false, attrs = "") =>
    `<button class="btn ${primary ? "primary" : "secondary"}" data-action="${action}" ${attrs}>${label}</button>`;
  const link = (label, route, primary = false) =>
    `<a class="btn ${primary ? "primary" : "secondary"}" href="#${route}">${label}</a>`;
  const tag = (id, copy) =>
    `<div class="assumption-note"><span class="assumption-tag">ASSUMPTION ${id}</span><button data-action="assumptions" data-q="${id}">${copy}</button></div>`;
  const notice = (title, body, neutral = false) =>
    `<div class="notice ${neutral ? "neutral" : ""}" role="note"><strong>${title}</strong>${body ? `<div class="notice-body">${body}</div>` : ""}</div>`;
  const head = (eyebrow, title, body = "", state = "", action = "") =>
    `<div class="page-top"><div><div class="kicker"><span class="eyebrow">${eyebrow}</span>${state ? `<span class="state">${state}</span>` : ""}</div><h1>${title}</h1>${body ? `<p>${body}</p>` : ""}</div>${action}</div>`;
  const steps = (active = 1) =>
    `<div class="steps" role="group" aria-label="${T("Intake steps", "Matakan karɓar haja")}">${[T("Add document", "Ƙara takarda"), T("Review draft", "Duba daftari"), T("Apply changes", "Aiwatar da canje-canje")].map((x, i) => `<span class="${i === active ? "active" : ""}"><b class="step-num">${i + 1}</b>${x}</span>`).join("")}</div>`;
  const questions = [
    [
      "Q01",
      "Owner-only now; how should future delegation work?",
      "Mai kasuwanci kaɗai yanzu; ta yaya za a ba wani izini?",
      "Owner-only in this demo. No delegation controls.",
      "Mai kasuwanci kaɗai a wannan gwaji.",
    ],
    [
      "Q02",
      "Free, trial and legacy plan access",
      "Izinin tsarin Free, gwaji da tsofaffin tsare-tsare",
      "Business is the default. Starter has no AI. Free is an assumed demo entitlement, not a plan promise.",
      "Business ne na gwaji. Starter ba shi da AI. Izinin Free zato ne.",
    ],
    [
      "Q03",
      "Allowance, reset date and failed-work charging",
      "Iyaka, ranar sabuntawa da cajin aikin da ya gaza",
      "50 draft credits per month is illustrative. Hard stop at the limit; no overage charge. Existing drafts can be reviewed.",
      "Daftari 50 a wata misali ne. A tsaya idan an kai iyaka; babu ƙarin caji.",
    ],
    [
      "Q04",
      "Partial success, repair approval and PO atomicity",
      "Nasarar wasu layuka, amincewar gyara da karɓar PO",
      "Good direct-intake rows save. Repairs need fresh approval. An approved PO receipt saves all its selected lines together or none.",
      "Layuka masu kyau su ajiye. Gyara yana buƙatar sabon izini. Layukan PO da aka zaɓa su ajiye tare.",
    ],
    [
      "Q05",
      "Offline recheck and approval expiry",
      "Sake dubawa bayan dawowar intanet",
      "Changed stock, cost, price, unit or PO facts require review. No approval expiry duration is decided.",
      "Canjin haja, kuɗin saye, farashi ko ma’auni yana buƙatar sake dubawa.",
    ],
    [
      "Q06",
      "Historic profit after a cost correction",
      "Ribar tsofaffin tallace-tallace bayan gyaran kuɗin saye",
      "Unknown-cost sales remain excluded with coverage shown. This demo does not rewrite old sales. Backfill policy is undecided.",
      "Tallace-tallacen da ba a san kuɗin saye ba ba sa cikin lissafin riba.",
    ],
    [
      "Q07",
      "Retention, deletion and provider terms",
      "Tsawon ajiya, gogewa da sharuddan mai bayarwa",
      "Assumed: uploads 30 days, unfinished drafts 90 days, learned items 180 inactive days. Audit and backup retention remain open.",
      "Zato: takardu kwana 30, daftari kwana 90, abubuwan da aka koya kwana 180.",
    ],
    [
      "Q08",
      "Sharing tiers, support context and platform access",
      "Raba bayanai, taimako da izinin ma’aikatan dandali",
      "All sharing starts off. Revocation stops future sharing. Raw documents require per-item permission. Platform staff have no default analytics access. Wording needs qualified review.",
      "An kashe rabawa. Janye izini yana dakatar da rabawa. Takarda tana buƙatar izini na musamman.",
    ],
    [
      "Q09",
      "Merchant samples and quality thresholds",
      "Takardun ’yan kasuwa da ingancin sakamako",
      "All four journeys use SYNTHETIC records. Real, consented invoices and shop-staff labels are still required.",
      "Dukkan hanyoyi huɗu bayanan kwaikwayo ne. Ana jiran takardun gaske da izini.",
    ],
    [
      "Q10",
      "Pack conventions and medical-stock scope",
      "Ma’aunin fakiti da hajar magani",
      "Conversions are product-specific and must produce exact base units. Medical and inward consignment intake are excluded from this demo.",
      "Canjin ma’auni na kowane kaya ne. Ba a haɗa hajar magani ko consignment na shigowa ba.",
    ],
    [
      "Q11",
      "Safe manual/AI apply boundaries",
      "Hanyar ajiya mai aminci ga mutum da AI",
      "This prototype simulates safe commands. Existing manual write paths still need shared transactional controls. Restock-list storage is undecided.",
      "Wannan gwaji kwaikwayo ne; hanyoyin ajiya na ainihi har yanzu suna buƙatar gyara.",
    ],
    [
      "Q12",
      "Metric definitions and fair staff comparisons",
      "Ma’anar ƙididdiga da adalcin kwatanta ma’aikata",
      "Revenue/refunds, cost coverage and lead times need agreed definitions. No efficiency rankings without worked-hours evidence.",
      "A fayyace kuɗin shiga, kuɗin saye da lokacin kawo kaya. Babu jera ma’aikata ba tare da sa’o’in aiki ba.",
    ],
    [
      "Q13",
      "Production, provider and native-device proof",
      "Tabbacin tsarin gaske da na’urori",
      "No backend, model, deployment or native camera/offline behavior is proved here. Hausa copy needs native-speaker validation.",
      "Babu backend ko AI na gaske a nan. Hausa tana buƙatar dubawar mai harshen.",
    ],
  ];
  const row = (id, name, qty, cost, current, suggested, extra = {}) => ({
    id,
    name,
    qty,
    cost,
    current,
    suggested,
    unit: "piece",
    warehouse: "Main warehouse",
    sku: "SKU-" + String(id).padStart(3, "0"),
    status: "matched",
    confidence: 96,
    selected: false,
    usePrice: false,
    needsCost: false,
    acceptMissing: false,
    applied: false,
    stock: 20,
    ...extra,
  });
  function fixtures(ex) {
    if (ex === "whatsapp")
      return [
        row(1, "Indomie", 5, 8500, 10000, 10500, {
          unit: "carton",
          status: "unresolved",
          confidence: 64,
          issue: "price",
        }),
        row(2, "Peak Milk 400g", 2, 31000, 36000, 36500, { unit: "carton" }),
        row(3, "Golden Penny Spaghetti", 10, null, 14000, null, {
          unit: "bag",
          status: "unresolved",
          confidence: 91,
          needsCost: true,
          issue: "cost",
        }),
      ];
    if (ex === "po")
      return [
        row(1, "Indomie", 20, 8500, 10000, null, {
          unit: "carton",
          ordered: 20,
          poCost: 8300,
        }),
        row(2, "Peak Milk 400g", 4, 31000, 36000, null, {
          unit: "carton",
          ordered: 5,
          poCost: 30500,
        }),
        row(3, "Power Oil 5L", 12, 9800, 11500, 11900, {
          ordered: 12,
          poCost: 9400,
        }),
        row(4, "Kings Veg Oil 3L", 10, 6200, null, 7200, {
          newProduct: true,
          status: "unresolved",
          issue: "unexpected",
          confidence: 86,
          usePrice: true,
        }),
      ];
    if (ex === "sheet")
      return Array.from({ length: 300 }, (_, i) =>
        row(
          i + 1,
          `Sample product ${String(i >= 280 && i < 295 ? i - 279 : i + 1).padStart(3, "0")}`,
          i >= 295 ? -2 : 10,
          i >= 240 && i < 280 ? null : 100,
          140,
          150,
          {
            newProduct: i >= 240 && i < 280,
            status:
              i < 240
                ? "matched"
                : i < 280
                  ? "new"
                  : i < 295
                    ? "duplicate"
                    : "unresolved",
            confidence: i < 240 ? 98 : i < 280 ? 88 : 55,
            needsCost: i >= 240 && i < 280,
            issue:
              i >= 295
                ? "invalid"
                : i >= 280
                  ? "duplicate"
                  : i >= 240
                    ? "cost"
                    : "",
            group:
              i < 240
                ? "clean"
                : i < 280
                  ? "new"
                  : i < 295
                    ? "duplicate"
                    : "invalid",
            usePrice: i >= 240 && i < 280,
          },
        ),
      );
    return [
      row(1, "Power Oil 5L", 12, 9800, 11500, 11900),
      row(2, "Kings Veg Oil 3L", 10, 6200, null, 7200, {
        newProduct: true,
        status: "new",
        confidence: 85,
        usePrice: true,
      }),
      row(3, "Gino tomato paste", 1, 9500, 240, 260, {
        unit: "choose",
        status: "unresolved",
        issue: "unit",
        confidence: 62,
      }),
    ];
  }
  if (!s.rows.length) s.rows = fixtures(s.example);
  const names = {
    oil: T("Oil receipt", "Rasitin mai"),
    whatsapp: T("WhatsApp stock list", "Jerin haja na WhatsApp"),
    sheet: T("300-product spreadsheet", "Takardar kaya 300"),
    po: T("Invoice against PO-1042", "Invoice da PO-1042"),
  };
  const chosen = () =>
    s.rows.filter((r) => r.selected && !r.applied && valid(r));
  const valid = (r) =>
    !!r.name.trim() &&
    !!r.sku.trim() &&
    !["unresolved", "duplicate", "skipped"].includes(r.status) &&
    Number.isSafeInteger(r.qty) && r.qty > 0 &&
    r.unit !== "choose" &&
    Number.isFinite(r.cost) && r.cost >= 0 &&
    (!r.needsCost || r.acceptMissing) &&
    (!r.usePrice || (Number.isFinite(r.suggested) && r.suggested >= 0));
  function seedRehearsal() {
    if (s.rehearsal !== "planted") return;
    if (s.example === "oil") { s.rows[0].name = "Power Oil 3L"; s.rows[0].sku = "POWER-3L"; }
    if (s.example === "whatsapp") s.rows[1].cost = 3100;
    if (s.example === "sheet") s.rows[0].warehouse = "Kano warehouse";
    if (s.example === "po") s.rows[1].qty = 5;
  }
  function start(ex, route) {
    s.example = ex;
    s.rows = fixtures(ex);
    s.revision = 1;
    s.saved = true;
    s.applied = false;
    s.openRows = [];
    s.stage = 0;
    s.changeAccepted = false;
    s.appliedKeys = [];
    s.audit = [];
    s.limits = {};
    s.expandedConfident = false;
    s.columnConfirmed = ex !== "sheet";
    s.failureStage = "generation";
    s.authorizedRevision = null;
    seedRehearsal();
    store();
    go(route || "upload");
  }
  const go = (r) => {
    if (location.hash === "#" + r) render();
    else location.hash = r;
  };
  const stateLabel = (st) => `<span class="state">${st}</span>`;
  function showDialog(title, body, actions = "") {
    priorFocus = document.activeElement;
    $("#dialog-content").innerHTML =
      `<h2 id="dialog-title">${title}</h2>${body}${actions ? `<div class="dialog-actions">${actions}</div>` : ""}`;
    $("#detail-dialog").showModal();
  }
  function closeDialog() {
    $("#detail-dialog").close();
    priorFocus?.focus?.();
  }
  function toast(en, ha) {
    $("#toast").textContent = T(en, ha);
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#toast").hidden = true), 4000);
  }
  function assumptions(id) {
    showDialog(
      T("Decisions still awaiting review", "Shawarwarin da ake jiran dubawa"),
      `<p class="muted">${T("Gate 1 is pending. These are prototype assumptions, not approved requirements.", "Ana jiran amincewar Gate 1. Waɗannan zato ne na samfurin gwaji.")}</p>${questions.map((q) => `<section class="assumption-entry" id="assumption-${q[0]}"><span class="assumption-tag">ASSUMPTION ${q[0]}</span><p><strong>${T(q[1], q[2])}</strong></p><p>${T(q[3], q[4])}</p></section>`).join("")}`,
    );
    if (id)
      setTimeout(
        () => $("#assumption-" + id)?.scrollIntoView({ block: "start" }),
        50,
      );
  }
  function allowance() {
    return `<aside class="allowance"><div class="section-head"><strong>${T("Monthly AI allowance", "Iyakacin AI na wata")}</strong><a href="#limit">${s.scenario === "limit" ? "50" : "18"} / 50</a></div><div class="bar" style="--value:${s.scenario === "limit" ? 100 : 36}%" role="meter" aria-label="${T("Draft credits used", "Daftarin da aka yi amfani da su")}" aria-valuenow="${s.scenario === "limit" ? 50 : 18}" aria-valuemin="0" aria-valuemax="50"><span></span></div><p>${T("Included in your subscription. Resets 1 December.", "Yana cikin biyan kuɗinka. Zai sabunta ranar 1 Disamba.")}</p>${tag("Q03", T("Illustrative allowance and reset date.", "Iyaka da ranar sabuntawa na misali ne."))}</aside>`;
  }
  const routes = [
    ["home", "Prototype guide", "Jagorar gwaji"],
    ["inventory", "Inventory · Stock In", "Haja · Karɓar kaya"],
    ["po-entry", "Purchase order · Receive", "Purchase order · Karɓa"],
    ["bulk-entry", "Products · Bulk Add", "Kaya · Ƙara da yawa"],
    ["upload", "Upload / paste / camera", "Takarda / rubutu / hoto"],
    ["processing", "Staged loading", "Matakan karantawa"],
    ["review", "Review and edit", "Duba kuma gyara"],
    ["confirm", "Apply confirmation", "Tabbatar da aiwatarwa"],
    ["applying", "Applying", "Ana aiwatarwa"],
    ["result", "Applied result", "Sakamakon ajiya"],
    ["partial", "Partial failure", "Wasu sun gaza"],
    ["repair", "Proposed repair", "Gyaran da aka ba da shawara"],
    ["support", "Contact customer care", "Tuntuɓi masu taimako"],
    ["offline", "Offline approval pending", "Ana jiran intanet"],
    ["recheck", "Reconnect recheck", "Sake dubawa"],
    ["conflict", "Stock changed · re-review", "Haja ta canza · sake dubawa"],
    ["pending", "Confirmation pending", "Ana jiran tabbaci"],
    ["unreadable", "Unreadable photo", "Hoton bai fito ba"],
    ["duplicate", "Duplicate document", "Takarda mai maimaituwa"],
    ["totals", "Totals mismatch", "Jimilla ba ta daidaita ba"],
    ["failed", "Failed", "Aiki ya gaza"],
    ["expired", "Expired draft", "Daftari ya ƙare"],
    ["cancelled", "Cancelled", "An soke"],
    ["empty", "No drafts yet", "Babu daftari tukuna"],
    ["drafts", "Reopen unfinished draft", "Buɗe daftarin da bai ƙare ba"],
    ["sources", "Price sources", "Tushen farashi"],
    ["audit", "Audit record", "Bayanan abin da aka yi"],
    ["insights", "AI-2 · Business insights", "AI-2 · Bayanin kasuwanci"],
    ["restock", "AI-3 · Transfer-first restock", "AI-3 · Cika haja"],
    ["analytics", "AI-4 · Follow-up questions", "AI-4 · Tambayoyin biye"],
    ["staff", "AI-5 · Staff performance", "AI-5 · Ayyukan ma’aikata"],
    ["settings", "AI settings and sharing", "Saituna da raba bayanai"],
    ["memory", "Learned items", "Abubuwan da aka koya"],
    ["limit", "Allowance reached", "An kai iyaka"],
    ["plan", "AI unavailable on plan", "Babu AI a wannan tsari"],
    [
      "no-access",
      "Admin / Cashier · no access",
      "Admin / Cashier · babu izini",
    ],
  ];
  function home() {
    return (
      head(
        T("Assistant design preview", "Samfurin mataimakin AI"),
        T(
          "Less typing. More time for your shop.",
          "Rage rubutu. Ƙara lokacin kula da shago.",
        ),
        T(
          "Walk through a delivery, then decide what belongs in the first release. Everything here is a safe, synthetic rehearsal.",
          "Gwada karɓar kaya, sannan a zaɓi abin da za a gina. Dukkan bayanai na kwaikwayo ne.",
        ),
        "",
        `<a class="btn primary" href="#inventory">${T("Start with Stock In", "Fara da karɓar haja")} ${icon("arrow")}</a>`,
      ) +
      `<div class="split"><div><div class="section-head"><h2>${T("Four deliveries to try", "Karɓar kaya huɗu don gwadawa")}</h2><span class="badge">SYNTHETIC</span></div>${[
        [
          "oil",
          "01",
          T("An oil receipt", "Rasitin mai"),
          T(
            "3 items · one pack question · suggested prices",
            "Kaya 3 · tambayar fakiti · shawarar farashi",
          ),
        ],
        [
          "whatsapp",
          "02",
          T("A WhatsApp stock list", "Jerin haja na WhatsApp"),
          T(
            "3 items · ambiguous price · one missing cost",
            "Kaya 3 · farashi marar tabbas · kuɗin saye ya ɓace",
          ),
        ],
        [
          "sheet",
          "03",
          T("Set up a 300-product shop", "Shigar da kaya 300"),
          T(
            "240 clean · 40 new · 15 duplicates · 5 invalid",
            "240 masu kyau · sabbi 40 · maimaituwa 15 · marasa kyau 5",
          ),
        ],
        [
          "po",
          "04",
          T("Check a delivery against a PO", "Kwatanta invoice da PO"),
          T(
            "Short shipment · price changes · an unordered item",
            "Rashin cikar kaya · canjin farashi · ƙarin kaya",
          ),
        ],
      ]
        .map(
          ([ex, n, title, body]) =>
            `<a class="scenario-card" href="#upload?example=${ex}"><span class="arrow">↗</span><span class="eyebrow">${n} · ${T("Example", "Misali")} 6.${ex === "oil" ? 5 : ex === "whatsapp" ? 6 : ex === "sheet" ? 7 : 8}</span><h3>${title}</h3><p>${body}</p></a>`,
        )
        .join(
          "",
        )}</div><aside><div class="panel"><span class="eyebrow">${T("Review status", "Matsayin dubawa")}</span><h2 class="spaced">${T("A proposal, not a promise.", "Shawara ce, ba tabbaci ba.")}</h2><p class="spaced muted">${T("Gate 1 answers are still pending. Open the assumption register before signing off.", "Ana jiran amsoshin Gate 1. Duba zato kafin amincewa.")}</p>${tag("Q09", T("Real merchant invoices still needed.", "Ana jiran takardun ’yan kasuwa na gaske."))}${btn(T("View all 13 assumptions", "Duba zato 13"), "assumptions")}</div>${allowance()}</aside></div><hr class="divider"><div class="section-head"><h2>${T("Every screen and state", "Dukkan shafuka da matakai")}</h2><span class="muted">${routes.length} ${T("linked views", "shafuka masu alaƙa")}</span></div><div class="screen-directory">${routes
        .filter((r) => r[0] !== "home")
        .map((r) => `<a href="#${r[0]}?preview=1">${T(r[1], r[2])} ↗</a>`)
        .join("")}</div>`
    );
  }
  function inventoryRows() {
    const initial = [
      ["Power Oil 5L", 20, "piece", 9400, 11500],
      ["Peak Milk 400g", 38, "carton", 30500, 36000],
      ["Gino tomato paste", 50, "piece", 190, 240],
    ];
    const rows = initial.map(([name, quantity, unit, cost, price]) => {
      const applied = s.rows.find(r => r.applied && !r.newProduct && r.name === name);
      const base = name === "Power Oil 5L" && s.changeAccepted ? 18 : quantity;
      return [name, `${base + (applied?.qty || 0)} ${unitName(unit)}`, applied ? applied.cost : cost, applied?.usePrice ? applied.suggested : price];
    });
    s.rows.filter(r => r.applied && (r.newProduct || !initial.some(x => x[0] === r.name))).slice(0, 12).forEach(r => rows.push([r.name, `${r.qty} ${unitName(r.unit)}`, r.cost, r.usePrice ? r.suggested : r.current]));
    return rows;
  }
  function inventory() {
    return (
      head(
        T("Inventory / Main warehouse", "Haja / Babban sito"),
        T("Stock on hand", "Hajar da ke akwai"),
        T(
          "Your next delivery starts here.",
          "Nan ne za a fara karɓar kayanka na gaba.",
        ),
        "",
        btn(T("Stock In", "Karɓi haja"), "stock-in", true),
      ) +
      `<div class="grid3"><div class="metric"><span class="muted">${T("Active products", "Kayan da ake sayarwa")}</span><span class="number">128</span><small>${T("Main warehouse · SYNTHETIC", "Babban sito · SYNTHETIC")}</small></div><div class="metric"><span class="muted">${T("Low on stock", "Haja ta yi ƙasa")}</span><span class="number">5</span><a href="#restock">${T("Review suggestions", "Duba shawarwari")} ↗</a></div><div class="metric"><span class="muted">${T("Unfinished intake", "Daftarin da bai ƙare ba")}</span><span class="number">1</span><a href="#drafts">${T("Continue your draft", "Ci gaba da daftari")} ↗</a></div></div><table class="data-table spaced"><thead><tr><th>${T("Product", "Kaya")}</th><th>${T("On hand", "Akwai")}</th><th>${T("Cost", "Kuɗin saye")}</th><th>${T("Selling price", "Farashin sayarwa")}</th></tr></thead><tbody>${[
        ...inventoryRows(),
      ]
        .map(
          (r) =>
            `<tr><td data-label="${T("Product", "Kaya")}">${r[0]}</td><td data-label="${T("On hand", "Akwai")}">${r[1]}</td><td data-label="${T("Cost", "Kuɗin saye")}">${money(r[2])}</td><td data-label="${T("Selling price", "Sayarwa")}">${money(r[3])}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><div class="spaced inline"><a href="#bulk-entry">${T("Products → Bulk Add", "Kaya → Ƙara da yawa")} ↗</a><a href="#po-entry">${T("Purchase orders → Receive", "Purchase orders → Karɓa")} ↗</a></div>`
    );
  }
  function entry(po = false) {
    return (
      head(
        po
          ? T("Purchase orders / PO-1042", "Purchase orders / PO-1042")
          : T("Products / Bulk Add", "Kaya / Ƙara da yawa"),
        po
          ? T("A delivery from Musa Wholesale", "Kaya daga Musa Wholesale")
          : T(
              "Put your whole shop on the shelf.",
              "Shigar da duk kayan shagonka.",
            ),
        po
          ? T(
              "Ordered 37 units across 3 products. Check the invoice before you receive.",
              "An yi odar raka’a 37 na kaya 3. Duba invoice kafin karɓa.",
            )
          : T(
              "Bring your spreadsheet or stock list. Review the draft before any product is created.",
              "Kawo takardar lissafi ko jerin haja. Duba daftari kafin ƙara kaya.",
            ),
        "",
        btn(
          po
            ? T("Receive with AI", "Karɓa da AI")
            : T("Add with AI", "Ƙara da AI"),
          po ? "start-po" : "start-sheet",
          true,
        ),
      ) +
      `<div class="split"><div>${po ? receipt("po-order") : `<div class="upload-zone">${icon("file")}<h2>${T("A list is all you need.", "Jerin kaya ya isa.")}</h2><p class="muted">CSV · Excel · ${T("notebook photo · pasted list", "hoton littafi · rubutun da aka liƙa")}</p></div>`}<div class="spaced"><button class="text-btn" data-action="manual">${T("Use manual entry instead", "Shigar da hannu maimakon AI")} ↗</button></div></div><aside>${po ? tag("Q04", T("Partial receipt requires a new safe receiving foundation.", "Karɓar wasu kaya yana buƙatar sabon tsari mai aminci.")) : tag("Q10", T("Pack conversions need your confirmation.", "Canjin ma’aunin fakiti yana buƙatar amincewarka."))}${allowance()}</aside></div>`
    );
  }
  function receipt(type = "oil") {
    if (type !== "po-order" && s.example === "whatsapp")
      return (
        '<div class="receipt"><span class="eyebrow">SYNTHETIC · ' +
        T("Original pasted list", "Jerin asali") +
        '</span><pre class="source-text">indomie 5 cartons 8500\npeak milk tin 2 ctn 31k\ngolden penny spag 10 bags</pre><p class="caption muted">' +
        T(
          "Original shorthand. Price meaning is not assumed.",
          "Gajerun kalmomin asali. Ba a ɗauki ma’anar farashi ba.",
        ) +
        "</p></div>"
      );
    if (type !== "po-order" && s.example === "sheet")
      return (
        '<div class="receipt"><span class="eyebrow">SYNTHETIC · Sheet 1 / 300 rows</span><h3 class="spaced">Item · Qty left · Price</h3><p class="spaced">Sample product 001 · 10 · ₦150<br>Sample product 002 · 10 · ₦150<br>Sample product 003 · 10 · ₦150</p><p class="caption muted spaced">' +
        T(
          "“Price” is proposed as selling price. Existing costs come from sample catalog history; new-product costs are unknown.",
          "An ɗauki “Price” a matsayin farashin sayarwa. Kuɗin sayen tsofaffin kaya daga tarihin misali; na sababbi ba a sani ba.",
        ) +
        "</p></div>"
      );
    const po = type === "po-order";
    const list = po
      ? [
          ["Indomie · 20 cartons", 166000],
          ["Peak Milk · 5 cartons", 152500],
          ["Power Oil 5L · 12", 112800],
        ]
      : s.example === "po"
        ? [
            ["Indomie · 20 cartons", 170000],
            ["Peak Milk · 4 cartons", 124000],
            ["Power Oil 5L · 12", 117600],
            ["Kings Veg Oil 3L · 10", 62000],
          ]
        : s.example === "whatsapp"
          ? [
              ["Indomie · 5 cartons", 42500],
              ["Peak Milk · 2 cartons", 62000],
              ["Spaghetti · 10 bags", null],
            ]
          : [
              ["Power Oil 5L · 12", 117600],
              ["Kings Veg Oil 3L · 10", 62000],
              ["Gino · 1 carton (50 sachets)", 9500],
            ];
    return `<div class="receipt"><div class="receipt-header"><span class="eyebrow">SYNTHETIC · ${po ? "PO-1042" : T("Source preview", "Tushen takarda")}</span><h3 class="spaced">Musa Wholesale</h3><small>3 November 2026 · ${T("Prices illustrative", "Farashi na misali")}</small></div>${list.map(([name, amount]) => `<div class="receipt-line"><span>${name}</span><span>${amount === null ? "—" : money(amount)}</span></div>`).join("")}<div class="receipt-line total"><span>${T("Total", "Jimilla")}</span><span>${money(po ? 431300 : s.example === "po" ? 473600 : s.example === "whatsapp" ? 104500 : 189100)}</span></div></div>`;
  }
  function upload() {
    return (
      steps(0) +
      head(
        T("Smart Intake / New draft", "Karɓar haja / Sabon daftari"),
        T("What came into your shop?", "Waɗanne kaya aka kawo?"),
        T(
          "Add your document. We will prepare a draft for you to check.",
          "Ƙara takardarka. Za mu shirya daftari don ka duba.",
        ),
        "draft",
      ) +
      `<div class="split"><section><div class="tabs" role="tablist" aria-label="${T("Input method", "Hanyar shigarwa")}">${[
        ["file", T("Upload file", "Loda fayil")],
        ["paste", T("Paste a list", "Liƙa jerin kaya")],
        ["camera", T("Take photo", "Ɗauki hoto")],
      ]
        .map(
          ([v, title]) =>
            `<button role="tab" class="tab" aria-selected="${s.tab === v}" data-action="tab" data-tab="${v}">${title}</button>`,
        )
        .join(
          "",
        )}</div>${s.tab === "paste" ? `<label>${T("Your stock list", "Jerin hajarka")}<textarea id="paste" placeholder="indomie 5 cartons 8500&#10;peak milk tin 2 ctn 31k&#10;golden penny spag 10 bags">${esc(s.paste)}</textarea></label>` : `<div class="upload-zone"><div class="upload-icon">${icon(s.tab === "camera" ? "file" : "upload")}</div><h2>${s.tab === "camera" ? T("A clear photo works best.", "Hoto mai kyau ya fi.") : T("Invoice, stock list, or spreadsheet", "Invoice, jerin haja ko takardar lissafi")}</h2><p class="muted">${T("JPG, PNG, PDF, CSV or XLSX · max 20 MB assumed", "JPG, PNG, PDF, CSV ko XLSX · iyaka MB 20 zato ne")}</p><label class="btn secondary" for="file-picker">${s.tab === "camera" ? T("Open camera / choose photo", "Buɗe kyamara / zaɓi hoto") : T("Choose a file", "Zaɓi fayil")}</label><input id="file-picker" type="file" accept="${s.tab === "camera" ? "image/*" : ".pdf,.csv,.xlsx,image/*"}" ${s.tab === "camera" ? 'capture="environment"' : ""} hidden></div>`}<p class="caption spaced">${s.selectedFile ? esc(s.selectedFile) + " · " : ""}${T("Local preview only: file contents are not read. The selected synthetic example is used.", "Gwaji na gida: ba a karanta fayil ba. Ana amfani da misalin kwaikwayo.")}</p>${tag("Q13", T("Camera opens a native file picker where supported. Native capture is unverified.", "Za a buɗe zaɓin hoto idan na’ura ta yarda. Ba a tabbatar da kyamara ba."))}<div class="review-actions"><div><strong>${T("Nothing changes until you approve.", "Ba za a canza komai ba sai ka amince.")}</strong><p>${T("Only product fields are used in this demo.", "Bayanan kaya kaɗai ake amfani da su a gwaji.")}</p></div>${btn(T("Prepare my draft", "Shirya daftari na"), "prepare", true)}</div></section><aside>${receipt()}${tag("Q09", T("Synthetic fixture, not an extraction accuracy test.", "Misalin kwaikwayo ne, ba gwajin karanta takarda ba."))}${allowance()}</aside></div>`
    );
  }
  function processing(apply = false) {
    const stage = apply
      ? T("Saving the approved changes", "Ana ajiye canje-canjen da aka amince")
      : [
          "Reading your document",
          "Finding your products",
          "Preparing your draft",
        ][s.stage];
    return (
      steps(apply ? 2 : 0) +
      head(
        T("Smart Intake", "Karɓar haja"),
        apply
          ? T(
              "Saving only what you approved.",
              "Ana ajiye abin da ka amince kaɗai.",
            )
          : T(
              "Turning your list into a draft.",
              "Ana shirya daftari daga jerinka.",
            ),
        T(
          "You can leave this page. Your draft stays here.",
          "Za ka iya barin shafin. Daftarinka zai tsaya a nan.",
        ),
        apply ? "applying" : "draft",
      ) +
      `<div class="split"><div><ol class="stage-list">${(apply ? [T("Rechecking your approval", "Ana sake duba izini"), stage, T("Confirming the result", "Ana tabbatar da sakamako")] : [T("Reading your document", "Ana karanta takardarka"), T("Finding your products", "Ana gano kayanka"), T("Preparing your draft", "Ana shirya daftari")]).map((label, i) => `<li class="${i === s.stage ? "active" : ""}"><span class="stage-dot">${i < s.stage ? "✓" : i + 1}</span><span>${label}${i === s.stage ? `<small> · ${T("in progress", "ana yi")}</small>` : ""}</span></li>`).join("")}</ol><div aria-label="${T("Loading draft rows", "Ana loda layuka")}">${[1, 2, 3].map(() => '<div class="skeleton-row"><div class="skeleton"></div><div class="skeleton short"></div></div>').join("")}</div><div class="inline spaced">${btn(T("Save and leave", "Ajiye ka fita"), "leave")}</div></div><aside>${notice(T("This is a timed simulation.", "Kwaikwayon matakai ne."), T("No file is uploaded and no AI request is made.", "Ba a loda fayil ko aika buƙatar AI ba."), true)}${tag("Q11", T("Live apply depends on safe shared business rules.", "Ajiya na gaske yana buƙatar dokokin kasuwanci masu aminci."))}</aside></div>`
    );
  }
  function status(r) {
    return r.applied
      ? "applied"
      : !valid(r) && r.status !== "skipped" ? T("Needs your decision", "Yana buƙatar shawararka")
      : {
          matched: T("Matched", "An gano"),
          new: T("New product", "Sabon kaya"),
          unresolved: T("Needs your decision", "Yana buƙatar shawararka"),
          duplicate: T("Possible duplicate", "Mai yiwuwa maimaituwa"),
          skipped: T("Skipped", "An tsallake"),
        }[r.status] || r.status;
  }
  function unitName(v) {
    return (
      {
        piece: T("piece", "guda"),
        carton: T("carton", "kwali"),
        bag: T("bag", "buhu"),
        pack: T("pack", "fakiti"),
        choose: T("Choose unit", "Zaɓi ma’auni"),
      }[v] || v
    );
  }
  // Source fixtures are immutable evidence, separate from editable proposals.
  function sourceRow(r) { return fixtures(s.example).find(x => x.id === r.id); }
  function sourceLine(r) {
    const original = sourceRow(r);
    if (s.example === "whatsapp") return ["indomie 5 cartons 8500", "peak milk tin 2 ctn 31k", "golden penny spag 10 bags"][r.id - 1];
    if (s.example === "oil" && r.id === 3) return "Gino tomato paste ×1 carton (50 sachets) @ ₦9,500";
    if (s.example === "sheet") return `${original.name} · Qty left: ${original.qty} · Price: ${money(original.suggested)}`;
    return `${original.name} ×${original.qty} ${unitName(original.unit)} @ ${money(original.cost)}`;
  }
  function confidenceNote(r) {
    if (r.issue === "unit") return T("Low confidence · pack needs your choice", "Tabbaci ƙasa · ka zaɓi ma’aunin fakiti");
    if (r.issue === "price") return T("Low confidence · price meaning unclear", "Tabbaci ƙasa · ma’anar farashi ba a fili ba");
    if (r.issue === "duplicate") return T("Low confidence · identity needs checking", "Tabbaci ƙasa · a duba shaidar kaya");
    if (r.needsCost) return T("Cost unknown · not a zero-cost purchase", "Ba a san kuɗin saye ba · ba saye kyauta ba ne");
    if (r.newProduct) return T("Medium confidence · new catalog item", "Tabbaci matsakaici · sabon kaya");
    return T("High confidence · name and pack match the sample catalog", "Tabbaci mai yawa · suna da fakiti sun dace da kundin misali");
  }
  function priceDetails(r) {
    return `<details class="price-options" data-price-details="${r.id}"><summary>${T("Selling price", "Farashin sayarwa")}: ${r.usePrice ? T("proposed", "shawara") + " " + money(r.suggested) : T("keep", "a bar") + " " + money(r.current)} · ${T("view options", "duba zaɓuɓɓuka")}</summary><div class="price-strip"><div><span>${T("Current selling", "Farashin yanzu")}</span><strong>${r.current === null ? "—" : money(r.current)}</strong></div><div><span>${T("Suggested selling", "Shawarar farashi")}</span><strong>${r.suggested === null ? "—" : money(r.suggested)}</strong></div></div>${r.suggested !== null ? `<label class="check"><input type="checkbox" data-price="${r.id}" ${r.usePrice ? "checked" : ""} ${r.applied ? "disabled" : ""}>${T("Use the proposed selling price", "Yi amfani da farashin da aka ba da shawara")} ${money(r.suggested)}</label>` : `<p>${T("No reliable suggestion. You can enter a price in Edit.", "Babu shawara mai tabbaci. Za ka iya rubuta farashi a Gyara.")}</p>`}<a href="#sources">${T("Sources, dates and pack sizes", "Tushe, kwanan wata da ma’aunin fakiti")} ↗</a></details>`;
  }
  function rowUI(r) {
    return `<article class="item-row" data-row-id="${r.id}"><div class="item-head"><label class="check row-check"><input type="checkbox" data-select-row="${r.id}" ${r.selected ? "checked" : ""} ${!valid(r) || r.applied ? "disabled" : ""} aria-label="${T("Select", "Zaɓi")} ${esc(r.name)}"></label><div><h3>${esc(r.name)}</h3><div class="item-sub"><span class="badge ${!valid(r) ? "blue" : ""}">${status(r)}</span><span>${r.selected && !r.applied ? T("Selected · not applied", "An zaɓa · ba a aiwatar ba") : ""}</span></div><p class="stock-effect">${r.issue === "unit" ? T("Choose how to count this stock", "Zaɓi yadda za a lissafta haja") : `${r.newProduct ? T("Create product; add", "Ƙirƙiri kaya; ƙara") : T("Add", "Ƙara")} <strong>${r.qty} ${unitName(r.unit)}</strong>`} → ${esc(r.warehouse)}</p><p class="caption muted">${r.issue === "unit" ? T("Document carton cost", "Kuɗin kwali a takarda") : T("Cost per stock unit", "Kuɗin saye na raka’a")}: <strong>${r.cost === null ? T("Not provided", "Ba a bayar ba") : money(r.cost)}</strong>${r.issue === "unit" ? " · " + T("convert after choosing the unit", "a canza bayan zaɓin ma’auni") : ""}</p></div><button class="text-btn" data-action="row-details" data-id="${r.id}" aria-expanded="${s.openRows.includes(r.id)}">${T("Edit", "Gyara")} ↗</button></div><div class="row-detail"><p class="source-evidence"><span class="field-label">${T("Source line", "Layin tushe")} ${r.id}</span><br>${esc(sourceLine(r))}</p><p class="caption muted">${esc(confidenceNote(r))} · ${T("sample rating, not measured", "kimar gwaji ce, ba a auna ba")}</p>${r.needsCost ? `<p class="item-sub"><span class="badge">${T("Cost needs update", "A sabunta kuɗin saye")}</span>${T("Excluded from profit until resolved", "Ba a cikin riba har sai an gyara")}</p>` : ""}${r.issue === "unit" ? notice(T("Count as 50 sachets or 1 carton?", "A lissafta sachet 50 ko kwali 1?"), `<div class="inline">${btn(T("50 sachets", "Sachet 50"), "unit-pieces", false, `data-id="${r.id}"`)}${btn(T("1 carton", "Kwali 1"), "unit-carton", false, `data-id="${r.id}"`)}</div>`) : ""}${r.issue === "price" ? notice(T("Is ₦8,500 the cost of one carton?", "₦8,500 kuɗin sayen kwali ɗaya ne?"), btn(T("Yes, per carton", "Eh, na kwali ɗaya"), "resolve-price", false, `data-id="${r.id}"`)) : ""}${r.needsCost ? `<label class="check"><input type="checkbox" data-zero="${r.id}" ${r.acceptMissing ? "checked" : ""}>${T("Save as ₦0 and remind me to update the cost", "Ajiye a ₦0, a tuna mini in sabunta kuɗin saye")}</label>` : ""}${r.issue === "unexpected" ? notice(T("Not on this purchase order", "Ba ya cikin wannan PO"), `<div class="inline">${btn(T("Include in this receipt", "Haɗa a wannan karɓa"), "include", false, `data-id="${r.id}"`)}${btn(T("Hold for review", "Riƙe don dubawa"), "skip-row", false, `data-id="${r.id}"`)}</div>`) : ""}${r.issue === "duplicate" ? notice(T("Check the product match.", "Duba kayan da ya dace."), T("Edit to choose its catalog identity, or leave it out.", "Gyara don zaɓin shaidar kaya, ko a bar shi.")) : ""}${!valid(r) && !["unit", "price", "cost", "unexpected", "duplicate"].includes(r.issue) && r.status !== "skipped" ? notice(T("Check the quantity and cost.", "Duba adadi da kuɗin saye."), T("Use whole stock units above zero and a cost of zero or more.", "Yi amfani da cikakkun raka’a sama da sifili da kuɗin saye da bai gaza sifili ba.")) : ""}${r.ordered !== undefined ? `<p class="caption muted spaced">${T("Ordered", "Oda")}: ${r.ordered} · ${T("Delivered", "An kawo")}: ${r.qty} · ${T("Outstanding", "Sauran")}: ${Math.max(0, r.ordered - r.qty)}<br>${T("PO cost → invoice cost", "Kuɗin PO → kuɗin invoice")}: ${money(r.poCost)} → ${money(r.cost)} / ${unitName(r.unit)}</p>` : ""}${priceDetails(r)}${s.openRows.includes(r.id) ? editFields(r) : ""}</div></article>`;
  }
  function editFields(r) {
    return `<div class="panel spaced"><div class="section-head"><strong>${T("Edit this proposal", "Gyara wannan shawara")}</strong><span class="state">${r.applied ? "applied" : valid(r) ? "ready" : "unresolved"}</span></div><div class="field-grid two">${[
      ["name", T("Product name", "Sunan kaya"), "text"],
      ["sku", "SKU", "text"],
      ["qty", T("Quantity", "Adadi"), "number"],
      ["cost", T("Cost per unit (₦)", "Kuɗin saye (₦)"), "number"],
      [
        "suggested",
        T("Proposed selling price (₦)", "Shawarar farashi (₦)"),
        "number",
      ],
    ]
      .map(
        ([field, label, type]) =>
          `<label>${label}<input type="${type}" ${type === "number" ? (field === "qty" ? 'min="1" step="1" inputmode="numeric"' : 'min="0" step="any" inputmode="decimal"') : ""} data-field="${field}" data-id="${r.id}" value="${esc(r[field])}" ${r.applied ? "disabled" : ""}></label>`,
      )
      .join(
        "",
      )}<label>${T("Stock unit", "Ma’aunin haja")}<select data-field="unit" data-id="${r.id}" ${r.applied || (!r.newProduct && r.issue !== "unit") ? "disabled" : ""}>${["choose", "piece", "carton", "bag", "pack"].map((u) => `<option ${r.unit === u ? "selected" : ""} value="${u}">${unitName(u)}</option>`).join("")}</select></label><label>${T("Receiving warehouse", "Siton karɓa")}<select data-field="warehouse" data-id="${r.id}" ${r.applied ? "disabled" : ""}><option ${r.warehouse === "Main warehouse" ? "selected" : ""}>Main warehouse</option><option ${r.warehouse === "Kano warehouse" ? "selected" : ""}>Kano warehouse</option></select></label><label>${T("Catalog match", "Kayan da ya dace")}<select data-field="match" data-id="${r.id}" ${r.applied ? "disabled" : ""}>${r.name !== sourceRow(r).name ? `<option value="candidate" selected>${esc(r.name)} · ${esc(r.sku)}</option>` : ""}<option value="same" ${!r.newProduct && r.name === sourceRow(r).name ? "selected" : ""}>${esc(sourceRow(r).name)} · ${esc(sourceRow(r).sku)}</option><option value="new" ${r.newProduct ? "selected" : ""}>${T("Create a new product", "Ƙirƙiri sabon kaya")}</option><option value="ambiguous">${T("Two possible matches · ask me", "Kaya biyu masu yiwuwa · tambaye ni")}</option></select></label></div>${r.newProduct ? `<label class="spaced">${T("Suggested category", "Shawarar rukuni")}<select data-field="category" data-id="${r.id}"><option value="Cooking oil" ${(!r.category || r.category === "Cooking oil") ? "selected" : ""}>${T("Cooking oil", "Man girki")}</option><option value="Groceries" ${r.category === "Groceries" ? "selected" : ""}>${T("Groceries", "Kayan abinci")}</option></select></label>` : ""}<p class="caption muted spaced">${T("Editing clears this row’s selection. The source line stays unchanged.", "Gyara yana soke zaɓin layin. Layin tushe ba ya canzawa.")}</p><div class="inline spaced">${btn(T("Skip this row", "Tsallake wannan layi"), "skip-row", false, `data-id="${r.id}"`)}${btn(T("Done editing", "An gama gyara"), "row-details", false, `data-id="${r.id}"`)}</div></div>`;
  }
  function summary() {
    const c = chosen(),
      newCount = c.filter((r) => r.newProduct).length;
    return T(
      `Add stock to ${c.length - newCount} products${newCount ? ` and create ${newCount} new product${newCount > 1 ? "s" : ""}` : ""}`,
      `Ƙara haja ga kaya ${c.length - newCount}${newCount ? `, ƙirƙiri sabbin kaya ${newCount}` : ""}`,
    );
  }
  function reviewRows() {
    const confident = s.example === "po" ? [] : s.rows.filter(r => valid(r) && r.confidence >= 90 && !r.applied && !r.needsCost && !(s.changeAccepted && r.id === 1));
    if (!confident.length) return `<div class="row-list">${[...s.rows].sort((a,b) => Number(valid(a)) - Number(valid(b))).map(rowUI).join("")}</div>`;
    const ids = new Set(confident.map(r => r.id));
    return `<div class="row-list">${s.rows.filter(r => !ids.has(r.id)).sort((a,b) => Number(valid(a)) - Number(valid(b))).map(rowUI).join("")}</div><details class="group" data-confident ${s.expandedConfident ? "open" : ""}><summary><span>${confident.length} ${T("matched rows to inspect", "layukan da aka gano don dubawa")}<small style="display:block">${confident.map(r => `${esc(r.name)} +${r.qty} · ${T("line", "layi")} ${r.id} · ${unitName(r.unit)} → ${esc(r.warehouse)}`).join("; ")}</small></span><span class="muted">${confident.filter(r => r.selected).length} ${T("selected", "an zaɓa")}</span></summary>${confident.map(rowUI).join("")}</details>`;
  }
  function review() {
    const c = chosen(),
      unresolved = s.rows.filter(
        (r) => !valid(r) && r.status !== "skipped" && !r.applied,
      ).length;
    return (
      steps(1) +
      head(
        T("Smart Intake / Review", "Karɓar haja / Dubawa"),
        s.example === "po"
          ? T("Check this delivery", "Duba wannan karɓa")
          : T(
              "Check what arrived",
              "Duba kayan da aka kawo",
            ),
        s.example === "sheet"
          ? T(
              "300 items: 240 clean, 40 new, 15 likely duplicates, 5 invalid.",
              "Kaya 300: 240 masu kyau, sabbi 40, maimaituwa 15, marasa kyau 5.",
            )
          : T(
              `${s.rows.length} items found. ${unresolved} ${unresolved === 1 ? "needs" : "need"} your decision. Nothing has been saved to stock.`,
              `An gano kaya ${s.rows.length}. ${unresolved} na buƙatar shawararka. Ba a ajiye haja ba.`,
            ),
        "reviewing",
      ) +
      `${s.changeAccepted ? notice(T("You are reviewing changed stock.", "Kana sake duba hajjar da ta canza."), T("Power Oil now has 18 on hand. An approved +12 would bring it to 30. Your old approval was cleared.", "Power Oil yanzu 18 ne. Ƙarin 12 zai kai 30. An soke tsohon izini.")) : ""}${s.scenario === "low" ? notice(T("Two products look alike.", "Kaya biyu sun yi kama."), T("Low confidence does not mean a row is safe to approve. Choose the exact product in Details & edit.", "Rashin tabbaci yana buƙatar dubawa. Zaɓi kayan da ya dace a Bayani da gyara.")) : ""}${s.example === "po" ? notice(T("Invoice is ₦42,300 above the PO.", "Invoice ya fi PO da ₦42,300."), T("₦62,000 is an unordered item. Peak Milk is short by 1 carton. Three costs rose.", "₦62,000 na kayan da ba a yi oda ba ne. Peak Milk ya rage kwali 1. Kuɗin saye uku sun ƙaru.")) : ""}${s.example === "sheet" ? notice(T("“Price” is read as selling price.", "An karanta “Price” a matsayin farashin sayarwa."), `<label class="check"><input id="column-confirm" type="checkbox" ${s.columnConfirmed ? "checked" : ""}>${T("Price means selling price; Qty left is opening stock. Costs are separate.", "Price farashin sayarwa ne; Qty left hajar farko ce. Kuɗin saye daban ne.")}</label>`) : ""}<div class="split"><div><div class="section-head"><span class="muted">SYNTHETIC · ${T("Revision", "Bita")} ${s.revision}</span><button class="text-btn" data-action="approve-confident" ${s.example === "sheet" && !s.columnConfirmed ? "disabled" : ""}>${T("Select matched rows", "Zaɓi layukan da aka gano")}</button></div>${
        s.example === "sheet"
          ? ["invalid", "duplicate", "new", "clean"]
              .map((g) => {
                const rr = s.rows.filter((r) => r.group === g),
                  limit = s.limits[g] || 10;
                return `<details class="group" ${["invalid", "duplicate"].includes(g) ? "open" : ""} data-review-group="${g}"><summary>${{ clean: T("240 confident rows", "Layuka 240 masu tabbaci"), new: T("40 new products", "Sabbin kaya 40"), duplicate: T("15 possible duplicates", "Maimaituwa 15"), invalid: T("5 rows to fix", "Layuka 5 don gyara") }[g]}<span class="muted">${rr.filter((r) => r.selected).length} ${T("selected", "an zaɓa")}</span></summary>${rr.slice(0, limit).map(rowUI).join("")}${rr.length > limit ? btn(T(`Show next ${Math.min(10, rr.length - limit)} rows`, `Nuna layuka ${Math.min(10, rr.length - limit)} na gaba`), "more", false, `data-group="${g}"`) : ""}</details>`;
              })
              .join("")
          : reviewRows()
      }<div class="review-actions"><div><strong>${c.length} ${T("rows selected · not applied", "layuka da aka zaɓa · ba a aiwatar ba")}</strong><p>${c.length ? summary() : T("Choose rows to include. Unresolved rows stay here.", "Zaɓi layukan da za a haɗa. Marasa warwarewa za su tsaya.")}<br>${T("Selling prices change only where selected.", "Farashi zai canza inda aka zaɓa kaɗai.")}</p></div>${btn(T("Continue to Apply", "Ci gaba zuwa Aiwatarwa"), "confirm", true, c.length && (s.example !== "sheet" || s.columnConfirmed) ? "" : "disabled")}</div><div class="inline spaced">${btn(T("Save draft & leave", "Ajiye daftari ka fita"), "leave")}${btn(T("Cancel draft", "Soke daftari"), "cancel")}</div></div><aside class="receipt-side">${receipt()}<p class="receipt-caption">${T("Every value traces back to a document line or a cited price suggestion.", "Kowane bayani yana da tushen layin takarda ko shawarar farashi.")}</p><a href="#sources">${T("Review price evidence", "Duba tushen farashi")} ↗</a>${tag("Q04", T("Repairs need new approval. PO receipts save together.", "Gyara yana buƙatar sabon izini. Layukan PO suna ajiya tare."))}${tag("Q10", T("Pack conventions stay specific to this product.", "Ma’aunin fakiti na wannan kaya kaɗai ne."))}</aside></div>`
    );
  }
  function confirm() {
    const c = chosen();
    return (
      steps(2) +
      head(
        T("Smart Intake / Approval", "Karɓar haja / Amincewa"),
        T("Here is exactly what will change.", "Ga ainihin abin da zai canza."),
        T(
          "You can go back and change your mind. No business record changes until you apply.",
          "Za ka iya komawa ka gyara. Ba a canza bayanai ba sai ka aiwatar.",
        ),
        "reviewing",
      ) +
      `${c.length ? `<div class="row-list">${c.map((r) => `<div class="item-row"><strong>${esc(r.name)}</strong><p class="spaced">${r.newProduct ? T("Create product and add", "Ƙirƙiri kaya sannan ƙara") : T("Add", "Ƙara")} <strong>${r.qty} ${unitName(r.unit)}</strong> → ${esc(r.warehouse)}</p><p class="muted">${T("Cost", "Kuɗin saye")} ${money(r.cost)} ${r.needsCost ? "· " + T("cost needs update; excluded from profit", "a sabunta kuɗin saye; ba cikin riba ba") : ""} · ${r.usePrice ? T("Set selling price to", "Sanya farashi") : ""} ${r.usePrice ? money(r.suggested) : T(`Selling price stays ${money(r.current)}`, `Farashi ya tsaya ${money(r.current)}`)}</p><small>SKU: ${esc(r.sku)} · ${T("Source", "Tushe")}: ${T("document line", "layin takarda")} ${r.id} · ${esc(confidenceNote(r))}</small></div>`).join("")}</div>${tag("Q04", T(s.example === "po" ? "The selected receipt saves together or not at all." : "Good rows save even if another row fails. Repairs ask you again.", s.example === "po" ? "Layukan karɓa su ajiye tare ko babu." : "Layuka masu kyau su ajiye ko da wani ya gaza. Gyara zai tambaye ka."))}<div class="review-actions"><div><strong>${summary()}</strong><p>${T("Apply authorizes only these listed changes · Sadiq Ahmed", "Aiwatarwa na ba da izinin waɗannan canje-canje kaɗai · Sadiq Ahmed")}</p></div>${btn(s.scenario === "offline" ? T("Approve for when online", "Amince idan intanet ya dawo") : T(`Apply · ${c.length} selected rows`, `Aiwatar · layuka ${c.length} da aka zaɓa`), "apply", true, 'id="apply-button"')}</div><div class="spaced">${link(T("Back to review", "Koma dubawa"), "review")}</div>` : notice(T("No rows selected", "Ba a zaɓi layi ba"), link(T("Choose rows", "Zaɓi layuka"), "review", true))}`
    );
  }
  function commit(partial = false) {
    const c = chosen();
    if (!c.length) return;
    if (s.authorizedRevision !== s.revision) return;
    const items = chosen();
    items.forEach((r, i) => {
      if (partial && i === Math.min(1, items.length - 1)) {
        r.failed = true;
        return;
      }
      const k = `${s.example}:${s.revision}:${r.id}`;
      if (!s.appliedKeys.includes(k)) {
        s.appliedKeys.push(k);
        r.applied = true;
        s.audit.push({
          name: r.name,
          qty: r.qty,
          unit: r.unit,
          price: r.usePrice ? r.suggested : r.current,
          needsCost: r.needsCost,
        });
      }
    });
    s.applied = true;
    s.saved = true;
    store();
  }
  function result(partial = false) {
    const done = s.rows.filter((r) => r.applied),
      failed = s.rows.filter((r) => r.failed);
    if (!done.length) return head(T("Smart Intake / Result", "Karɓar haja / Sakamako"), T("No stock changes confirmed", "Ba a tabbatar da canjin haja ba"), T("Your draft is still available to review.", "Daftarinka yana nan don dubawa."), "reviewing") + link(T("Return to draft", "Koma daftari"), "review", true);
    return (
      head(
        T("Smart Intake / Result", "Karɓar haja / Sakamako"),
        partial
          ? T("The good rows are safely saved.", "An ajiye layuka masu kyau.")
          : T(`${done.length} rows applied.`, `An aiwatar da layuka ${done.length}.`),
        partial
          ? T(
              "One row needs a fix. Your successful rows will not be applied again.",
              "Layi ɗaya yana buƙatar gyara. Ba za a sake ajiye layukan da suka yi nasara ba.",
            )
          : T(
              "Only the approved changes were applied in this synthetic simulation.",
              "Canje-canjen da ka amince da su kaɗai aka yi a kwaikwayon nan.",
            ),
        partial ? "partially_applied" : "applied",
        link(T("View audit record", "Duba tarihin aiki"), "audit"),
      ) +
      `<div class="grid3"><div class="metric"><span class="muted">${T("Applied rows", "Layukan da aka yi")}</span><span class="number">${done.length}</span><small>${T("Confirmed in demo only", "Tabbacin gwaji kaɗai")}</small></div><div class="metric"><span class="muted">${T("Needs attention", "Mai buƙatar kulawa")}</span><span class="number">${partial ? failed.length : s.rows.filter((r) => !r.applied && r.status !== "skipped").length}</span></div><div class="metric"><span class="muted">${T("Price changes", "Canjin farashi")}</span><span class="number">${done.filter((r) => r.usePrice).length}</span></div></div>${s.example === "po" ? notice(T("Purchase order balance", "Ragowar purchase order"), s.rows.filter(r => r.ordered !== undefined).map(r => `${esc(r.name)}: ${Math.max(0,r.ordered-(r.applied?r.qty:0))} ${unitName(r.unit)} ${T("outstanding", "ana jira")}`).join("<br>") + `<p>${s.rows.some(r=>r.ordered!==undefined && r.ordered>(r.applied?r.qty:0)) ? T("PO-1042 stays open.", "PO-1042 ya tsaya a buɗe.") : T("Selected ordered goods are received.", "An karɓi kayan oda da aka zaɓa.")} ${s.rows[3]?.applied ? T("Kings Oil was included.", "An haɗa Kings Oil.") : T("Kings Oil was not received.", "Ba a karɓi Kings Oil ba.")}</p>`) : ""}${done.some((r) => r.needsCost) ? notice(T("Remember to update missing costs.", "Ka tuna da sabunta kuɗin saye da ya ɓace."), T("Those products stay out of profit figures. Revenue coverage remains visible.", "Waɗannan kaya ba sa cikin lissafin riba. Ana nuna iyakar bayanan kuɗin shiga.")) : ""}${partial ? `<div class="panel spaced"><span class="badge">failed</span><h2 class="spaced">${esc(failed[0]?.name || "Kings Veg Oil 3L")}</h2><p class="spaced muted">${T("A product with this SKU already exists. No stock or price change was made for this row.", "Akwai kaya da wannan SKU. Ba a canza haja ko farashin wannan layin ba.")}</p><div class="inline spaced">${link(T("Review proposed fix", "Duba gyaran da aka ba da shawara"), "repair", true)}${link(T("Contact customer care", "Tuntuɓi masu taimako"), "support")}</div></div>${tag("Q04", T("You approve the repair before it saves.", "Sai ka amince da gyara kafin ajiya."))}` : `<div class="spaced">${s.rows.some((r) => !r.applied && r.status !== "skipped") ? link(T("Continue remaining rows", "Ci gaba da sauran layuka"), "review", true) : link(T("Return to inventory", "Koma haja"), "inventory", true)}</div>`}<div class="spaced inline"><a href="#drafts">${T("All drafts", "Dukkan daftari")}</a><a href="#memory">${T("Review learned items", "Duba abubuwan da aka koya")}</a></div>`
    );
  }
  function empty(kind) {
    const defs = {
      empty: [
        "draft",
        T(
          "Your first draft starts with a list.",
          "Daftarinka na farko yana farawa da jerin kaya.",
        ),
        T(
          "An invoice, a photo or a few pasted lines will do.",
          "Invoice, hoto ko rubutun da aka liƙa zai yi.",
        ),
        T("Prepare a draft", "Shirya daftari"),
        "upload",
        "file",
      ],
      unreadable: [
        "failed",
        T(
          "The bottom of this photo is unclear.",
          "Ƙasan wannan hoton bai fito ba.",
        ),
        T(
          "We cannot read the quantity or cost on line 3. Retake the photo in good light, or enter that line yourself.",
          "Ba a iya karanta adadi ko kuɗin saye na layi 3 ba. Sake ɗaukar hoto ko shigar da layin da hannu.",
        ),
        T("Retake or choose a photo", "Sake ɗauka ko zaɓi hoto"),
        "upload",
        "file",
      ],
      failed: [
        "failed",
        T(
          "We could not finish this draft.",
          "Ba a iya kammala wannan daftarin ba.",
        ),
        T(
          "The reading attempt stopped. Your upload and any saved draft are still here. Nothing was added to stock.",
          "An dakatar da karantawa. Takardarka da daftari suna nan. Ba a ƙara haja ba.",
        ),
        T("Try a new attempt", "Sake gwadawa"),
        "processing",
        "file",
      ],
      expired: [
        "expired",
        T("This draft has expired.", "Wannan daftarin ya ƙare."),
        T(
          "Start a new revision and check the current stock before approving. Past applied changes stay in the audit record.",
          "Fara sabon bita ka duba hajar yanzu kafin amincewa. Ayyukan baya suna cikin tarihi.",
        ),
        T("Prepare a fresh draft", "Shirya sabon daftari"),
        "upload",
        "clock",
      ],
      cancelled: [
        "cancelled",
        T("This draft is closed.", "An rufe wannan daftarin."),
        T(
          "Unapplied work was cancelled. Earlier successful changes, if any, remain in the audit record.",
          "An soke abin da ba a yi ba. Ayyukan da suka yi nasara suna cikin tarihi.",
        ),
        T("Return to inventory", "Koma haja"),
        "inventory",
        "check",
      ],
      limit: [
        "draft",
        T(
          "You have used this month’s AI allowance.",
          "Ka yi amfani da duk iyakacin AI na watan nan.",
        ),
        T(
          "No extra charge. Your 50 draft credits reset on 1 December. You can still finish a ready draft or enter stock manually.",
          "Babu ƙarin caji. Daftari 50 za su sabunta 1 Disamba. Za ka iya kammala daftari ko shigar da haja da hannu.",
        ),
        T("Open saved drafts", "Buɗe daftarin da aka ajiye"),
        "drafts",
        "clock",
      ],
      plan: [
        "draft",
        T("AI is not available on this plan.", "Babu AI a wannan tsarin."),
        T(
          "Starter does not include the assistant. You can keep using manual stock entry.",
          "Starter bai haɗa da mataimaki ba. Za ka iya ci gaba da shigar da haja da hannu.",
        ),
        T("See eligible plans", "Duba tsare-tsaren da suka dace"),
        "settings",
        "lock",
      ],
    };
    const d = defs[kind];
    if (kind === "failed" && s.failureStage === "apply") {
      d[1] = T(
        "The approved changes were not saved.",
        "Ba a ajiye canje-canjen da aka amince ba.",
      );
      d[2] = T(
        "This attempt rolled back. No selected receipt line or price changed. Review the draft before a fresh approval.",
        "An soke wannan ƙoƙarin. Ba a canza layin karɓa ko farashi ba. Duba daftari kafin sabon izini.",
      );
      d[3] = T("Review the draft", "Duba daftari");
      d[4] = "review";
    }
    return `<div class="empty"><div class="glyph">${icon(d[5])}</div>${stateLabel(d[0])}<h1>${d[1]}</h1><p>${d[2]}</p>${kind === "plan" ? btn(d[3], "plan-options", true) : kind === "unreadable" ? btn(d[3], "retake", true) : link(d[3], d[4], true)}${kind === "unreadable" ? btn(T("Enter unreadable line manually", "Shigar da layin da hannu"), "manual-line") : kind === "limit" || kind === "plan" ? btn(T("Use manual Stock In", "Yi karɓar haja da hannu"), "manual") : ""}${["expired", "limit", "plan"].includes(kind) ? tag(kind === "expired" ? "Q07" : kind === "limit" ? "Q03" : "Q02", T("This policy is pending Boss review.", "Ana jiran amincewar Boss ga wannan doka.")) : ""}</div>`;
  }
  function offline(recheck = false, conflict = false, pending = false) {
    return (
      head(
        T("Smart Intake / Connection", "Karɓar haja / Intanet"),
        conflict
          ? T(
              "Stock changed while you were away.",
              "Haja ta canza yayin da ba ka nan.",
            )
          : pending
            ? T("We are checking whether it saved.", "Ana duba ko an ajiye.")
            : recheck
              ? T(
                  "You are back online. Let’s recheck.",
                  "Intanet ya dawo. Mu sake dubawa.",
                )
              : T(
                  "Your approval is waiting here.",
                  "Amincewarka tana jira a nan.",
                ),
        conflict
          ? T(
              "Nothing new has been applied. Please check the changed stock before approving again.",
              "Ba a yi sabon canji ba. Duba hajar da ta canza kafin sake amincewa.",
            )
          : pending
            ? T(
                "The reply was lost. Do not apply again. We will look up this exact action first.",
                "Amsar ta ɓace. Kada ka sake aiwatarwa. Za a fara duba wannan aikin.",
              )
            : T(
                "Your draft and choices are kept on this device in the demo. Stock is not confirmed yet.",
                "An riƙe daftari da zaɓinka a wannan na’urar gwaji. Ba a tabbatar da haja ba.",
              ),
        conflict
          ? "reviewing"
          : pending
            ? "confirmation_pending"
            : "approval_pending",
      ) +
      `<div class="split"><div>${conflict ? `<div class="row-list"><div class="item-row"><h2>Power Oil 5L</h2><div class="grid3 spaced"><div><span class="field-label">${T("When you approved", "Lokacin amincewa")}</span><h2>20</h2></div><div><span class="field-label">${T("Stock now", "Haja yanzu")}</span><h2>18</h2></div><div><span class="field-label">${T("After proposed +12", "Bayan shawarar +12")}</span><h2>30</h2></div></div><p class="caption muted spaced">${T("Source: inventory version changed · your invoice still says 12 units.", "Tushe: hajar sito ta canza · invoice har yanzu yana nuna raka’a 12.")}</p></div></div>${tag("Q05", T("A changed fact needs new approval, even if device timestamps tie.", "Canjin bayani yana buƙatar sabon izini."))}<div class="spaced">${btn(T("Re-review with current stock", "Sake duba hajar yanzu"), "accept-conflict", true)}</div>` : `<div class="panel"><div class="inline"><span class="status-icon">${icon("clock")}</span><div><strong>${s.offlineKind === "upload" ? T("Upload queued", "Takarda tana jira") : T("Approval saved on this device", "An ajiye amincewa a na’urar nan")}</strong><p class="muted">${T("Reference", "Shaida")}: TK-DEMO-1042 · ${T("revision", "bita")} ${s.revision}</p></div></div><p class="spaced">${pending ? T("We will find the original result before attempting another write.", "Za mu nemi sakamakon farko kafin wani ajiya.") : recheck ? T("Rechecking your role, plan, product, unit, price and stock.", "Ana sake duba izini, tsari, kaya, ma’auni, farashi da haja.") : T("We will recheck the current stock, prices and units when you reconnect.", "Za mu sake duba haja, farashi da ma’auni idan intanet ya dawo.")}</p></div><div class="spaced">${btn(pending ? T("Check original result", "Duba sakamakon farko") : recheck ? T("Check current records", "Duba bayanan yanzu") : T("Reconnect in demo", "Dawo da intanet a gwaji"), pending ? "lookup" : recheck ? "recheck" : "reconnect", true)}</div>`}</div><aside>${notice(T("No silent replacement.", "Babu canji a ɓoye."), T("An approval for +12 is not a cached stock balance. Changed facts come back to you.", "Izinin ƙarin 12 ba tsohon adadin haja ba ne. Za a sake tambayarka idan bayanai sun canza."), true)}${tag("Q05", T("This explicit review flow differs from generic timestamp sync.", "Wannan sake dubawa ya bambanta da daidaitawar lokaci."))}</aside></div>`
    );
  }
  function special(kind) {
    if (kind === "duplicate")
      return (
        head(
          T("Smart Intake / Duplicate check", "Karɓar haja / Maimaituwa"),
          T(
            "You have seen this invoice before.",
            "An riga an ga wannan invoice.",
          ),
          T(
            "Musa Wholesale · INV-1042 · uploaded 3 November. Open the saved draft to avoid receiving it twice.",
            "Musa Wholesale · INV-1042 · an loda 3 Nuwamba. Buɗe daftari don kada a karɓa sau biyu.",
          ),
          "reviewing",
        ) +
        notice(
          T("Possible duplicate document", "Takarda mai yiwuwa maimaituwa"),
          T(
            "Same supplier, invoice number and total. Another photo can still be the same delivery.",
            "Mai kaya, lambar invoice da jimilla iri ɗaya. Wani hoto na iya zama karɓa ɗaya.",
          ),
        ) +
        link(
          T("Open existing draft", "Buɗe daftarin da yake nan"),
          "review",
          true,
        ) +
        `<div class="spaced">${btn(T("This is a separate delivery", "Wannan wani karɓa ne"), "separate")}</div>`
      );
    if (kind === "totals")
      return (
        head(
          T("Smart Intake / Check totals", "Karɓar haja / Duba jimilla"),
          T(
            "These totals do not add up.",
            "Waɗannan jimilloli ba su daidaita ba.",
          ),
          T(
            "We will not invent a discount or change a line to make them fit.",
            "Ba za mu ƙirƙiri rangwame ko canza layi don daidaitawa ba.",
          ),
          "reviewing",
        ) +
        `<div class="grid3"><div class="metric"><span>${T("Document total", "Jimillar takarda")}</span><span class="number">₦190,100</span></div><div class="metric"><span>${T("Sum of lines", "Jimillar layuka")}</span><span class="number">₦189,100</span></div><div class="metric"><span>${T("Difference", "Bambanci")}</span><span class="number">₦1,000</span></div></div>${link(T("Review the source lines", "Duba layukan tushe"), "review", true)}`
      );
    return (
      head(
        T("Smart Intake / Repair", "Karɓar haja / Gyara"),
        T("A fix for the row that failed.", "Gyaran layin da ya gaza."),
        T(
          "Nothing else will be applied again. Check this fix before you approve it.",
          "Ba za a sake ajiye sauran ba. Duba wannan gyaran kafin amincewa.",
        ),
        "reviewing",
      ) +
      `<div class="panel"><span class="badge">unresolved → ready</span><h2 class="spaced">Kings Veg Oil 3L</h2><div class="grid2 spaced"><div><span class="eyebrow">${T("Before", "Da farko")}</span><p class="spaced">${T("Create new SKU KINGS-3L", "Ƙirƙiri sabon SKU KINGS-3L")}</p></div><div><span class="eyebrow">${T("Proposed fix", "Shawarar gyara")}</span><p class="spaced">${T("Match the existing Kings Veg Oil 3L instead. Add 10 units at ₦6,200. Keep its selling price unchanged.", "Haɗa da Kings Veg Oil 3L da yake nan. Ƙara raka’a 10 a ₦6,200. Kada a canza farashin sayarwa.")}</p></div></div><p class="caption muted spaced">${T("Source: existing SKU match + invoice line 2 · high confidence, demo rating", "Tushe: SKU da yake nan + layin invoice 2 · kimar gwaji ce")}</p></div>${tag("Q04", T("Every changed repair requires your fresh approval.", "Kowane sabon gyara yana buƙatar sake amincewarka."))}<div class="spaced">${btn(T("Apply this fix only", "Aiwatar da wannan gyara kaɗai"), "apply-repair", true, 'id="repair-button"')}</div>`
    );
  }
  function drafts() {
    const unfinished = s.rows.some(r => !r.applied && r.status !== "skipped");
    return (
      head(
        T("Your drafts", "Daftarin ka"),
        T("Pick up where you left off.", "Ci gaba daga inda ka tsaya."),
        T(
          "Reopening keeps your edits, row choices and applied history.",
          "Sake buɗewa yana riƙe gyara, zaɓin layuka da tarihin aiki.",
        ),
        "",
        link(T("New intake", "Sabon karɓa"), "upload"),
      ) +
      `<div class="draft-row"><div><span class="state">${s.applied ? unfinished ? "partially_applied" : "applied" : "reviewing"}</span><h2 class="spaced">${{ oil: T("Oil receipt", "Rasitin mai"), whatsapp: T("WhatsApp list", "Jerin WhatsApp"), sheet: T("300-product spreadsheet", "Takardar kaya 300"), po: T("Invoice versus PO", "Invoice da PO") }[s.example]}</h2><p>SYNTHETIC · ${T("revision", "bita")} ${s.revision} · ${s.rows.length} ${T("rows", "layuka")}</p><p>${T("Saved in this browser only.", "An ajiye a wannan burauzar kaɗai.")}</p></div>${link(T(unfinished ? "Continue draft" : "View result", unfinished ? "Ci gaba da daftari" : "Duba sakamako"), unfinished ? "review" : "result", true)}</div><div class="draft-row"><div><span class="state">expired</span><h3 class="spaced">${T("October stock list", "Jerin haja na Oktoba")}</h3><p>SYNTHETIC · ${T("View expiry experience", "Duba yadda ƙarewa yake")}</p></div><a class="btn secondary" href="#expired">${T("View", "Duba")}</a></div>${tag("Q07", T("Unfinished-draft retention is assumed to be 90 days.", "An ɗauka daftarin da bai ƙare ba zai tsaya kwana 90."))}`
    );
  }
  function sources() {
    return (
      head(
        T("Evidence / Price suggestions", "Shaida / Shawarar farashi"),
        T(
          "A price is only useful with context.",
          "Farashi yana buƙatar bayani.",
        ),
        T(
          "Kings Veg Oil 3L · same bottle size · prices in ₦. These are invented comparables, not live market research.",
          "Kings Veg Oil 3L · girman kwalba ɗaya · farashi a ₦. Waɗannan misalai ne, ba binciken kasuwa ba.",
        ),
        "",
        link(T("Back to draft", "Koma daftari"), "review", true),
      ) +
      notice(
        T(
          "SYNTHETIC SOURCES · PRICES ILLUSTRATIVE",
          "TUSHEN KWAIKWAYO · FARASHI NA MISALI",
        ),
        T(
          "Source URLs are reserved example domains. No external page is fetched.",
          "URLs na misali ne. Ba a buɗe wani shafi na waje ba.",
        ),
        true,
      ) +
      `<div class="grid3"><div class="metric"><span>${T("Comparable range", "Zangon farashi")}</span><span class="number">₦7,000–₦7,600</span></div><div class="metric"><span>${T("Suggested selling", "Shawarar sayarwa")}</span><span class="number">₦7,200</span></div><div class="metric"><span>${T("Confidence", "Tabbaci")}</span><span class="number">${T("Medium", "Matsakaici")}</span></div></div>${[
        ["A", 7000, "3L bottle", "3 Nov 2026"],
        [
          "B",
          7200,
          "₦43,200 / carton of 6 × 3L ÷ 6 → ₦7,200 / bottle",
          "2 Nov 2026",
        ],
        ["C", 7600, "3L bottle", "30 Oct 2026"],
      ]
        .map(
          ([id, price, pack, date]) =>
            `<div class="source-row"><div><strong>${T("Sample market source", "Tushen kasuwa na misali")} ${id}</strong><p>https://market-${id.toLowerCase()}.example.invalid/kings-3l</p><p>${pack} · ${date} · SYNTHETIC</p></div><strong>${money(price)}</strong></div>`,
        )
        .join(
          "",
        )}<div class="notice spaced"><strong>${T("Your own history comes first.", "Tarihin kasuwancinka ya fi muhimmanci.")}</strong><p>${T("Power Oil: cost rose from ₦9,400 to ₦9,800. Current selling ₦11,500 gives about 15% margin. Suggested ₦11,900 gives about 18%. Selling price stays unchanged unless selected.", "Power Oil: kuɗin saye ya tashi daga ₦9,400 zuwa ₦9,800. Farashin ₦11,500 yana ba da riba kusan 15%. Shawarar ₦11,900 kusan 18%. Sai ka zaɓa kafin canji.")}</p></div><details class="group"><summary>${T("No reliable market source?", "Babu ingantaccen tushen kasuwa?")}</summary><p class="spaced muted">${T("Show “No reliable market price found”. Offer a clearly labelled margin-based suggestion. Stale or mismatched pack sizes are not reliable comparables.", "A nuna “Ba a samu ingantaccen farashin kasuwa ba”. A bayar da shawara daga riba tare da bayani.")}</p></details>${tag("Q09", T("Freshness and quality thresholds need real invoice/source trials.", "Ingancin tushe yana buƙatar gwaji da bayanan gaske."))}`
    );
  }
  function audit() {
    return (
      head(
        T("Audit / TK-DEMO-1042", "Tarihi / TK-DEMO-1042"),
        T(
          "Proposed by AI. Approved by you.",
          "AI ya ba da shawara. Kai ka amince.",
        ),
        T(
          "A synthetic audit view. Recorded actions are append-only in this demonstration; it is not a production audit trail.",
          "Tarihin kwaikwayo. Ba tarihin tsarin gaske ba ne.",
        ),
        "applied",
      ) +
      `<div class="panel"><strong>Sadiq Ahmed · Owner</strong><p class="muted">Sadiq Provisions · SYNTHETIC · ${T("revision", "bita")} ${s.revision}</p></div>${[
        [
          "09:41",
          T("Document added", "An ƙara takarda"),
          T(
            "Original source kept separate from reviewed values.",
            "An ware bayanin tushe daga abin da aka duba.",
          ),
        ],
        [
          "09:42",
          T("Draft prepared", "An shirya daftari"),
          T(
            "AI proposed; no stock changed.",
            "AI ya ba da shawara; ba a canza haja ba.",
          ),
        ],
        [
          "09:43",
          T("Owner approval accepted", "An karɓi amincewar mai kasuwanci"),
          T(
            "Exact product, quantity, unit, warehouse and price choices.",
            "Ainihin kaya, adadi, ma’auni, sito da farashi.",
          ),
        ],
        [
          "09:43",
          T("Confirmed result", "An tabbatar da sakamako"),
          s.audit.length
            ? s.audit.map((a) => `${a.name} +${a.qty} ${a.unit}`).join(" · ")
            : T(
                "Sample: Power Oil +12, selling price unchanged.",
                "Misali: Power Oil +12, farashi bai canza ba.",
              ),
        ],
      ]
        .map(
          ([time, title, body]) =>
            `<article class="audit-event"><small>${time} · 3 Nov 2026</small><h3>${title}</h3><p>${esc(body)}</p></article>`,
        )
        .join(
          "",
        )}<div class="spaced">${link(T("Return to result", "Koma sakamako"), "result", true)}</div>${tag("Q11", T("Real commands must bind approval and audit to the same business transaction.", "Aiki na gaske ya haɗa izini da tarihi cikin ajiya ɗaya."))}`
    );
  }
  function insights() {
    return (
      head(
        T("AI-2 / Business insights", "AI-2 / Bayanin kasuwanci"),
        T("Your week, made clear.", "Makonninka a bayyane."),
        T(
          "26 October–1 November 2026 · Main warehouse · SYNTHETIC",
          "26 Oktoba–1 Nuwamba 2026 · Babban sito · SYNTHETIC",
        ),
        "",
        btn(
          T("Export this summary", "Fitar da wannan taƙaitawa"),
          "export",
          true,
        ),
      ) +
      `<div class="grid3"><div class="metric"><span>${T("Sales revenue", "Kuɗin shiga")}</span><span class="number">₦1,840,000</span><button class="text-btn" data-action="metric-source">${T("Down 9% · view 1,204 sales", "Ya ragu 9% · duba tallace-tallace 1,204")} ↗</button></div><div class="metric"><span>${T("Products below minimum", "Kayan da suka yi ƙasa")}</span><span class="number">5</span><a href="#restock">${T("Review stock", "Duba haja")} ↗</a></div><div class="metric"><span>${T("Known-cost coverage", "Bayanan kuɗin saye")}</span><span class="number">94%</span><button class="text-btn" data-action="metric-source">${T("6% excluded from profit", "An cire 6% daga lissafin riba")} ↗</button></div></div><div class="split spaced"><div><h2>${T("Three products made 41% of sales.", "Kaya uku sun samar da 41% na kuɗin shiga.")}</h2><div class="chart" role="img" aria-label="${T("Synthetic daily sales: 190000, 220000, 310000, 240000, 260000, 290000, 330000 naira", "Kuɗin shiga na misali a kwanaki bakwai")}">${[58, 67, 94, 73, 79, 88, 100].map((h, i) => `<div class="chart-col"><div class="chart-bar" style="--height:${h + 24}px"></div><span>${["M", "T", "W", "T", "F", "S", "S"][i]}</span></div>`).join("")}</div><p class="spaced muted">${T("Toiletries was your slowest category. Comparisons use the previous complete week, not an unfinished period.", "Kayan wanka ne suka fi jinkirin sayarwa. Kwatantawa da makon da ya gabata ne.")}</p></div><aside>${notice(T("Some costs need updating.", "Wasu kuɗin saye suna buƙatar sabuntawa."), T("Revenue is shown in full. Profit excludes unknown-cost items and says how much is covered.", "Ana nuna duk kuɗin shiga. Riba ba ta haɗa kayan da ba a san kuɗin saye ba."))}<a href="#analytics">${T("Ask a follow-up question", "Yi tambayar biye")} ↗</a></aside></div>${tag("Q06", T("Historical cost corrections are undecided.", "Ba a yanke shawarar gyaran tsohon kuɗin saye ba."))}${tag("Q12", T("Metric definitions must match the agreed reports.", "Ma’anar ƙididdiga ta dace da rahotannin da aka amince."))}`
    );
  }
  function restock() {
    return (
      head(
        T("AI-3 / Stock suggestions", "AI-3 / Shawarar haja"),
        T("Move stock before you buy more.", "Tura haja kafin sake saye."),
        T(
          "Check your other warehouse first. Every suggestion explains its numbers.",
          "Fara duba ɗayan sito. Kowane shawara yana nuna tushen lissafinsa.",
        ),
        "reviewing",
      ) +
      `<div class="panel"><div class="section-head"><h2>Peak Milk 400g</h2><span class="badge blue">${T("Transfer first", "Fara da tura haja")}</span></div><div class="grid3"><div class="metric"><span>Kano warehouse</span><span class="number">6</span><small>${T("On hand", "Akwai")}</small></div><div class="metric"><span>Main warehouse</span><span class="number">140</span><small>${T("On hand", "Akwai")}</small></div><div class="metric"><span>${T("Proposed move", "Shawarar turawa")}</span><span class="number">40</span><small>Main → Kano</small></div></div><p class="muted">${T("Main sells about 3 a day. Moving 40 leaves 100 there. Kano needs stock sooner. Based on 30 days of synthetic sales; confidence medium.", "Main yana sayar da kusan 3 a rana. Tura 40 zai bar 100. Kano yana buƙata da wuri. Bisa kwanaki 30 na kwaikwayo; tabbaci matsakaici.")}</p><div class="spaced">${btn(T("Review transfer proposal", "Duba shawarar tura haja"), "draft-transfer", true)}</div></div><details class="group spaced"><summary>${T("What about reordering?", "Yaya batun sake oda?")}</summary><p class="spaced">${T("A purchase suggestion comes after the transfer check. Without reliable supplier lead-time history, we say “not enough data”, rather than pretending a delivery date is known.", "Shawarar saye tana zuwa bayan duba turawa. Idan babu ingantaccen tarihin kawo kaya, a ce bayanai ba su isa ba.")}</p><div class="inline spaced">${btn(T("Preview purchase-order draft", "Duba daftarin PO"), "draft-po")}${btn(T("Preview restock list", "Duba jerin cika haja"), "draft-restock")}</div></details>${tag("Q11", T("The safe action boundaries and restock-list storage still need design.", "Ana buƙatar tsara hanyoyin aiki da ajiye jerin cika haja."))}${tag("Q12", T("Lead-time and fast/slow thresholds are not yet validated.", "Ba a tabbatar da ma’aunin saurin sayarwa da kawo kaya ba."))}`
    );
  }
  function analytics() {
    return (
      head(
        T("AI-4 / Ask your records", "AI-4 / Tambayi bayananka"),
        T("A question. A useful next step.", "Tambaya. Mataki mai amfani."),
        T(
          "Answers use only this shop’s sample records. You approve any suggested action.",
          "Amsoshi daga bayanan shagon misali ne kaɗai. Kai za ka amince da kowane aiki.",
        ),
      ) +
      `<div class="conversation"><div class="question">${T("What sold best last month?", "Waɗanne kaya suka fi sayuwa watan jiya?")}</div><div class="answer"><h2>${T("Indomie led by revenue.", "Indomie ya fi samar da kuɗin shiga.")}</h2><p class="muted">${T("1–30 September · 1,204 synthetic sales · confidence high", "1–30 Satumba · tallace-tallacen kwaikwayo 1,204 · tabbaci mai yawa")}</p><table class="data-table"><thead><tr><th>${T("Product", "Kaya")}</th><th>${T("Revenue", "Kuɗin shiga")}</th></tr></thead><tbody>${[
        ["Indomie", "₦420,000"],
        ["Power Oil 5L", "₦356,000"],
        ["Peak Milk 400g", "₦312,000"],
      ]
        .map(
          ([n, v]) =>
            `<tr><td data-label="${T("Product", "Kaya")}">${n}</td><td data-label="${T("Revenue", "Kuɗin shiga")}">${v}</td></tr>`,
        )
        .join(
          "",
        )}</tbody></table><button class="text-btn" data-action="metric-source">${T("View the records behind this answer", "Duba bayanan da aka yi amfani da su")} ↗</button></div>${s.chat.map((m) => `<div class="question">${esc(m.q)}</div><div class="answer"><h2>${m.kind === "offtopic" ? T("I can help with your shop’s records.", "Zan iya taimakawa da bayanan shagonka.") : m.kind === "compare" ? T("Indomie up 18%. Power Oil down 7%.", "Indomie ya ƙaru 18%. Power Oil ya ragu 7%.") : T("Two of those products are running low.", "Biyu daga waɗannan kaya suna ƙarewa.")}</h2><p class="muted">${m.kind === "offtopic" ? T("Please ask about your products, stock or sales. No unrelated records were accessed.", "Tambayi batun kaya, haja ko tallace-tallace.") : m.kind === "compare" ? T("September versus August · same warehouse and revenue definition · SYNTHETIC.", "Satumba da Agusta · sito da ma’anar kuɗin shiga ɗaya · SYNTHETIC.") : T("Peak Milk and Indomie · current stock plus last 30 days of sales · SYNTHETIC.", "Peak Milk da Indomie · hajar yanzu da tallace-tallacen kwanaki 30 · SYNTHETIC.")}</p>${m.kind === "stock" ? `<a href="#restock">${T("Review restock suggestions", "Duba shawarwarin cika haja")} ↗</a>` : ""}</div>`).join("")}</div><form id="chat-form" class="composer"><label>${T("Ask a follow-up", "Yi tambayar biye")}<input id="question" required maxlength="500" placeholder="${T("And compared to August?", "Yaya idan aka kwatanta da Agusta?")}"></label><button class="btn primary" type="submit">${T("Ask", "Tambaya")}</button></form><div class="inline spaced">${btn(T("Compare with August", "Kwatanta da Agusta"), "chat-compare")}${btn(T("Which are running low?", "Waɗanne suna ƙarewa?"), "chat-stock")}</div>${tag("Q12", T("Periods and answer metrics are synthetic demonstrations.", "Lokaci da lissafin amsa na kwaikwayo ne."))}`
    );
  }
  function staff() {
    return (
      head(
        T("AI-5 / Staff trends", "AI-5 / Ayyukan ma’aikata"),
        T(
          "See patterns. Start a fair conversation.",
          "Duba tsarin aiki. Yi tattaunawa cikin adalci.",
        ),
        T(
          "Owner only · 26 October–1 November · SYNTHETIC",
          "Mai kasuwanci kaɗai · 26 Oktoba–1 Nuwamba · SYNTHETIC",
        ),
      ) +
      notice(
        T("Hours worked are not available.", "Babu bayanan sa’o’in aiki."),
        T(
          "These are sales totals, not efficiency rankings. Different shifts and locations are not directly comparable.",
          "Waɗannan jimillar tallace-tallace ne, ba matsayin ƙwarewa ba. Lokuta da wurare sun bambanta.",
        ),
        true,
      ) +
      `<table class="data-table"><thead><tr><th>${T("Cashier", "Mai karɓar kuɗi")}</th><th>${T("Sales", "Tallace-tallace")}</th><th>${T("Average basket", "Matsakaicin ciniki")}</th><th>${T("Refunds", "Mayar da kuɗi")}</th></tr></thead><tbody>${[
        ["Amina", "62", "₦4,100", "1"],
        ["Yusuf", "48", "₦5,300", "0"],
      ]
        .map(
          (r) =>
            `<tr>${r.map((x, i) => `<td data-label="${[T("Cashier", "Mai kuɗi"), T("Sales", "Tallace-tallace"), T("Average basket", "Matsakaici"), T("Refunds", "Mayarwa")][i]}">${x}</td>`).join("")}</tr>`,
        )
        .join(
          "",
        )}</tbody></table><div class="spaced"><h2>${T("Worth a look, without assumptions about people.", "Abin dubawa, ba zargin mutane ba.")}</h2><p class="muted spaced">${T("Three discounts happened near closing time. Check the sale records and approval context before drawing conclusions. A manager’s reversal is not automatically the cashier’s action.", "An yi rangwame uku kusa da rufewa. Duba bayanan ciniki da izini kafin yanke hukunci. Aikin manaja ba na mai kuɗi kai tsaye ba ne.")}</p><div class="spaced">${btn(T("Review supporting sales", "Duba tallace-tallacen tushe"), "metric-source", true)}</div></div>${tag("Q12", T("Fair hours/shift/branch definitions remain unresolved.", "Ana jiran ma’anar kwatantawa bisa sa’o’i da wurin aiki."))}`
    );
  }
  function settings() {
    return (
      head(
        T("AI settings / Owner only", "Saitunan AI / Mai kasuwanci"),
        T("Your shop. Your choices.", "Shagonka. Zaɓinka."),
        T(
          "Changes below affect this prototype only. They do not change the production app.",
          "Canje-canjen nan na gwaji ne kaɗai. Ba sa canza manhajar gaske.",
        ),
      ) +
      `<div class="split"><div><h2>${T("Assistant capabilities", "Ayyukan mataimaki")}</h2>${[
        ["intake", "AI-1 · Smart Intake", "AI-1 · Karɓar haja"],
        ["insights", "AI-2 · Business insights", "AI-2 · Bayanin kasuwanci"],
        ["restock", "AI-3 · Stock suggestions", "AI-3 · Shawarar haja"],
        ["analytics", "AI-4 · Follow-up analytics", "AI-4 · Tambayoyin biye"],
        ["staff", "AI-5 · Staff performance", "AI-5 · Ayyukan ma’aikata"],
      ]
        .map(
          ([id, en, ha]) =>
            `<div class="setting-row"><div><strong>${T(en, ha)}</strong><p>${T("Owner access only. Switch off to pause new work.", "Mai kasuwanci kaɗai. Kashe don dakatar da sabon aiki.")}</p></div><label class="switch"><input type="checkbox" aria-label="${T(en, ha)}" data-setting="${id}" ${s.switches[id] ? "checked" : ""}></label></div>`,
        )
        .join(
          "",
        )}${tag("Q01", T("Future delegation is undecided; Owner-only is fixed now.", "Ba a yanke shawarar ba da izini ba; mai kasuwanci kaɗai yanzu."))}<label class="spaced">${T("Assistant language", "Harshen mataimaki")}<select id="settings-language"><option value="en" ${s.language === "en" ? "selected" : ""}>English</option><option value="ha" ${s.language === "ha" ? "selected" : ""}>Hausa</option></select></label><hr class="divider"><h2>${T("Help improve Track Kasuwa", "Taimaka inganta Track Kasuwa")}</h2><p class="muted spaced">${T("Your business analytics are private by default. Choose exactly what may be shared. You can turn sharing off at any time.", "Bayanan kasuwancinka na sirri ne. Zaɓi abin da za a raba. Za ka iya kashe rabawa a kowane lokaci.")}</p>${[
        [
          "quality",
          T("Usage and quality signals", "Bayanan amfani da inganci"),
          T(
            "Completion, errors and edits. No documents or sales figures.",
            "Kammalawa, kurakurai da gyara. Babu takardu ko kuɗin shiga.",
          ),
        ],
        [
          "aggregates",
          T(
            "Anonymized business aggregates",
            "Taƙaitattun bayanan kasuwanci marasa suna",
          ),
          T(
            "Selected combined totals. Exact fields still need approval.",
            "Zaɓaɓɓun jimilloli. Ana jiran amincewar bayanan da za a raba.",
          ),
        ],
        [
          "raw",
          T(
            "Ask me about individual documents",
            "Tambaye ni game da takarda ɗaya",
          ),
          T(
            "This only allows a permission request. Every document needs its own consent; nothing is shared now.",
            "Wannan izinin tambaya ne kaɗai. Kowane takarda yana buƙatar izininsa.",
          ),
        ],
      ]
        .map(
          ([id, title, body]) =>
            `<div class="setting-row"><div><strong>${title}</strong><p>${body}</p></div><label class="switch"><input type="checkbox" data-sharing="${id}" aria-label="${title}" ${s.sharing[id] ? "checked" : ""}></label></div>`,
        )
        .join(
          "",
        )}${tag("Q08", T("Sharing tiers, exact fields and notice wording await qualified review.", "Ana jiran dubawar matakan rabawa, bayanai da sanarwa."))}<p class="caption muted">${T("Turning off a tier stops future sharing. This prototype never sends anything.", "Kashe mataki yana dakatar da rabawa na gaba. Wannan gwaji ba ya aika komai.")}</p><hr class="divider"><h2>${T("Remembered preferences", "Zaɓin da aka tuna")}</h2><p class="muted spaced">${T("See, correct or delete unit conventions, aliases and supplier mappings.", "Duba, gyara ko goge ma’auni, sunayen kaya da masu kaya.")}</p><div class="spaced">${link(T("Manage learned items", "Sarrafa abubuwan da aka koya"), "memory", true)}</div></div><aside>${allowance()}${tag("Q02", T("Free/trial/legacy plan treatment is not approved.", "Ba a amince da tsarin Free, gwaji da tsofaffi ba."))}${tag("Q07", T("Assumed retention: documents 30 days; drafts 90; learned items 180.", "Zaton ajiya: takardu kwana 30; daftari 90; abubuwan da aka koya 180."))}${tag("Q13", T("Hausa wording and native device behavior require real testing.", "Hausa da na’urori suna buƙatar gwajin gaske."))}</aside></div>`
    );
  }
  function memory() {
    return (
      head(
        T("AI settings / Learned items", "Saitunan AI / Abubuwan da aka koya"),
        T("What your assistant remembers.", "Abin da mataimakinka ya tuna."),
        T(
          "Only this shop’s approved conventions. Edit or delete them whenever you choose.",
          "Abubuwan da shagonka ya amince da su kaɗai. Gyara ko goge idan ka ga dama.",
        ),
        "",
        btn(T("Add a convention", "Ƙara ma’auni"), "add-memory", true),
      ) +
      `${s.learned.length ? s.learned.map((m) => `<div class="source-row"><div><span class="eyebrow">${esc(m.kind)}</span><h3 class="spaced">${esc(m.name)}</h3><p>${esc(m.value)}</p><p>${T("Owner-approved · this organization only", "Mai kasuwanci ya amince · wannan shagon kaɗai")}</p></div><div class="inline">${btn(T("View / edit", "Duba / gyara"), "edit-memory", false, `data-id="${m.id}"`)}${btn(T("Delete", "Goge"), "delete-memory", false, `data-id="${m.id}"`)}</div></div>`).join("") : notice(T("No learned items", "Babu abin da aka koya"), T("Future unit questions will ask you again.", "Za a sake tambayarka game da ma’auni."), true)}${tag("Q07", T("Assumed expiry: 180 inactive days. Deletion stops future retrieval.", "Zaton ƙarewa: kwana 180 ba amfani. Gogewa yana hana sake amfani."))}${tag("Q10", T("A carton convention never silently applies to a different product.", "Ma’aunin kwali ba ya shafar wani kaya a ɓoye."))}`
    );
  }
  function support() {
    return (
      head(
        T("Customer care / Preview", "Masu taimako / Dubawa"),
        T(
          "Share the problem, not your whole shop.",
          "Raba matsalar, ba duk shagonka ba.",
        ),
        T(
          "Nothing will be sent automatically. Choose the context first.",
          "Ba a aika komai kai tsaye. Fara zaɓar bayanai.",
        ),
        "partially_applied",
      ) +
      `<div class="panel"><h2>${T("Support context", "Bayanin taimako")}</h2><p class="spaced">TK-DEMO-1042 · ${T("Row 2: duplicate SKU · no customer details", "Layi 2: SKU ya maimaitu · babu bayanan kwastoma")}</p><label class="check spaced"><input id="support-errors" type="checkbox" checked>${T("Include the error and draft reference", "Haɗa kuskure da shaidar daftari")}</label><label class="check"><input id="support-row" type="checkbox">${T("Include this row’s product, quantity and cost", "Haɗa kaya, adadi da kuɗin sayen wannan layi")}</label><label class="check"><input id="support-doc" type="checkbox">${T("Include this one synthetic invoice", "Haɗa wannan invoice ɗaya na kwaikwayo")}</label></div>${tag("Q08", T("Support-sharing wording and per-document consent are pending.", "Ana jiran sanarwar rabawa ga taimako da izinin takarda."))}<div class="spaced">${btn(T("Preview support message", "Duba saƙon taimako"), "support-preview", true)}</div>`
    );
  }
  function noAccess() {
    return `<div class="empty"><div class="glyph">${icon("lock")}</div><span class="eyebrow">${esc(s.role === "Owner" ? "Admin / Cashier" : s.role)}</span><h1>${T("The assistant is for the shop Owner.", "Mataimakin na mai kasuwanci ne.")}</h1><p>${T("Ask your Owner to review the delivery. Your normal work stays available according to your role.", "Nemi mai kasuwanci ya duba karɓar kaya. Ayyukanka na yau da kullum suna nan bisa izininka.")}</p>${btn(T("Back to my workspace", "Koma wurin aikina"), "normal-work", true)}<div class="inline">${btn(T("Preview Admin", "Gwada Admin"), "role-admin")}${btn(T("Preview Cashier", "Gwada Cashier"), "role-cashier")}${btn(T("Return to Owner demo", "Koma gwajin mai kasuwanci"), "role-owner")}</div>${tag("Q01", T("Owner-only is decided. Future delegation remains open.", "Mai kasuwanci kaɗai an yanke. Ana jiran tsarin ba da izini."))}${tag("Q08", T("Platform staff have no default access to merchant analytics.", "Ma’aikatan dandali ba su da izinin bayanan kasuwanci kai tsaye."))}</div>`;
  }
  function disabled(cap) {
    return `<div class="empty"><div class="glyph">${icon("lock")}</div><h1>${T("This AI capability is switched off.", "An kashe wannan aikin AI.")}</h1><p>${T("Your Owner can turn it on in AI settings. Manual entry stays available.", "Mai kasuwanci zai iya kunnawa a saitunan AI. Shigar da hannu yana nan.")}</p>${link(T("Open AI settings", "Buɗe saitunan AI"), "settings", true)}</div>`;
  }
  const pageFns = {
    home,
    inventory,
    "po-entry": () => entry(true),
    "bulk-entry": () => entry(false),
    upload,
    processing: () => processing(false),
    review,
    confirm,
    applying: () => processing(true),
    result: () => result(false),
    partial: () => result(true),
    repair: () => special("repair"),
    support,
    offline: () => offline(),
    recheck: () => offline(true),
    conflict: () => offline(false, true),
    pending: () => offline(false, false, true),
    unreadable: () => empty("unreadable"),
    duplicate: () => special("duplicate"),
    totals: () => special("totals"),
    failed: () => empty("failed"),
    expired: () => empty("expired"),
    cancelled: () => empty("cancelled"),
    empty: () => empty("empty"),
    drafts,
    sources,
    audit,
    insights,
    restock,
    analytics,
    staff,
    settings,
    memory,
    limit: () => empty("limit"),
    plan: () => empty("plan"),
    "no-access": noAccess,
  };
  function route() {
    return location.hash.slice(1).split("?")[0] || "home";
  }
  function translateChrome() {
    document.documentElement.lang = s.language;
    document
      .querySelectorAll("[data-en]")
      .forEach((e) => (e.textContent = T(e.dataset.en, e.dataset.ha)));
  }
  function render() {
    if (rendering) return;
    rendering = true;
    try {
    clearTimeout(timer);
    const active = document.activeElement;
    const focusKeys = ["data-field", "data-id", "data-select-row", "data-price", "data-zero", "data-action"];
    const focusAttrs = active?.closest("#main") ? focusKeys.filter(k => active.hasAttribute(k)).map(k => `[${k}="${CSS.escape(active.getAttribute(k))}"]`).join("") : "";
    const opened = lastRoute === route() ? [...document.querySelectorAll("details[open][data-price-details],details[open][data-review-group]")].map(el => el.hasAttribute("data-price-details") ? `[data-price-details="${el.dataset.priceDetails}"]` : `[data-review-group="${el.dataset.reviewGroup}"]`) : [];
    const r = route(),
      p = new URLSearchParams(location.hash.split("?")[1] || "");
    if (p.has("example") && p.get("example") !== s.example) {
      s.example = p.get("example");
      s.rows = fixtures(s.example);
      s.revision = 1;
      s.saved = true;
      s.applied = false;
      s.openRows = [];
    }
    if (
      p.get("preview") === "1" &&
      s.previewMarker !== location.hash &&
      [
        "confirm",
        "applying",
        "result",
        "partial",
        "repair",
        "pending",
        "support",
      ].includes(r)
    ) {
      s.example = "oil";
      s.rows = fixtures("oil");
      s.rows[2].unit = "piece";
      s.rows[2].qty = 50;
      s.rows[2].cost = 190;
      s.rows[2].status = "matched";
      s.rows[2].issue = "";
      s.rows.forEach((x) => (x.selected = true));
      s.revision = 1;
      s.authorizedRevision = 1;
      s.applied = false;
      s.appliedKeys = [];
      s.audit = [];
      s.previewMarker = location.hash;
      if (["result", "partial", "repair", "support"].includes(r))
        commit(["partial", "repair", "support"].includes(r));
    }
    document.body.classList.toggle("dark", s.theme === "dark");
    $("#preview").classList.toggle("phone", s.width === "phone");
    translateChrome();
    for (const id of [
      "language",
      "theme",
      "width",
      "role",
      "plan",
      "scenario",
      "outcome",
    ])
      $("#" + id).value = s[id];
    $("#example").value = s.example;
    $("#rehearsal").value = s.rehearsal || "correct";
    $("#preview").classList.toggle("intake-view", !["home", "insights", "restock", "analytics", "staff", "settings", "memory", "no-access", "plan", "limit"].includes(r));
    $("#profile-role").textContent = s.role + " · " + s.plan;
    $("#connection").textContent =
      s.scenario === "offline"
        ? T("Offline", "Babu intanet")
        : T("Online", "A intanet");
    $("#nav").innerHTML =
      `<span class="nav-label">${T("INVENTORY", "HAJA")}</span>${[
        ["inventory", "stock", T("Inventory", "Haja")],
        ["po-entry", "file", T("Purchase orders", "Purchase orders")],
        ["bulk-entry", "upload", T("Products", "Kaya")],
      ]
        .map(
          ([id, i, label]) =>
            `<a class="nav-link" href="#${id}" ${r === id ? 'aria-current="page"' : ""}>${icon(i)}${label}</a>`,
        )
        .join(
          "",
        )}<span class="nav-label">${T("ASSISTANT", "MATAIMAKI")}</span>${[
        ["drafts", "file", T("Your drafts", "Daftarin ka")],
        ["insights", "insight", T("Business insights", "Bayanin kasuwanci")],
        ["restock", "stock", T("Restock suggestions", "Shawarar cika haja")],
        ["analytics", "chat", T("Ask your records", "Tambayi bayananka")],
        ["staff", "people", T("Staff trends", "Ayyukan ma’aikata")],
      ]
        .map(
          ([id, i, label]) =>
            `<a class="nav-link" href="#${id}" ${r === id ? 'aria-current="page"' : ""}>${icon(i)}${label}</a>`,
        )
        .join("")}`;
    $("#breadcrumb").textContent = routes.find((x) => x[0] === r)
      ? T(routes.find((x) => x[0] === r)[1], routes.find((x) => x[0] === r)[2])
      : "Track Kasuwa";
    const cap = ["insights", "restock", "analytics", "staff"].includes(r)
      ? r
      : "intake";
    const publicRoutes = ["home", "inventory", "settings", "no-access", "plan"];
    let content;
    if (s.role !== "Owner" && !["home", "no-access"].includes(r))
      content = noAccess();
    else if (s.plan === "Starter" && !publicRoutes.includes(r))
      content = empty("plan");
    else if (
      !s.switches[cap] &&
      !publicRoutes.includes(r) &&
      !["memory", "limit"].includes(r)
    )
      content = disabled(cap);
    else content = (pageFns[r] || home)();
    $("#main").innerHTML =
      `<div class="fade">${p.get("preview") === "1" ? notice(T("SYNTHETIC STATE PREVIEW", "DUBAWAR MATAKI NA KWAIKWAYO"), T("This view is pre-filled. Use the four example journeys to try the complete flow.", "An riga an cika wannan dubawa. Yi amfani da hanyoyin misali huɗu don cikakken gwaji."), true) : ""}${content}</div>`;
    for (const selector of opened) { const el = document.querySelector(selector); if (el) el.open = true; }
    if (lastRoute === r && focusAttrs) {
      const same = document.querySelector(focusAttrs);
      const fallback = active?.dataset.id ? document.querySelector(`[data-row-id="${active.dataset.id}"] h3`) : null;
      if (fallback) fallback.tabIndex = -1;
      (same || fallback)?.focus({preventScroll:true});
    }
    store();
    if (lastRoute !== r) {
      window.scrollTo(0, 0);
      $("#main").focus({ preventScroll: true });
      lastRoute = r;
    }
    if (r === "processing" || r === "applying")
      timer = setTimeout(() => advance(r === "applying"), 1100);
    } finally { rendering = false; }
  }
  function advance(apply = false) {
    if (s.stage < 2) {
      s.stage++;
      render();
    } else if (apply) {
      if (s.outcome === "pending") {
        go("pending");
      } else if (
        s.outcome === "failed" ||
        (s.outcome === "partial" && s.example === "po")
      ) {
        s.failureStage = "apply";
        go("failed");
      } else {
        commit(s.outcome === "partial");
        go(s.outcome === "partial" ? "partial" : "result");
      }
    } else {
      if (s.scenario === "unreadable") go("unreadable");
      else go("review");
    }
  }
  function updateRow(id, fn) {
    const r = s.rows.find((x) => x.id === Number(id));
    if (!r || r.applied) return;
    fn(r);
    r.selected = false;
    s.revision++;
    s.authorizedRevision = null;
    s.saved = true;
    store();
    render();
  }
  // Transient feedback must not cover the next field during keyboard correction.
  document.addEventListener("focusin", e => {
    if ($("#preview").classList.contains("intake-view") && e.target.closest?.("#main")) $("#toast").hidden = true;
  });
  document.addEventListener("change", (e) => {
    if (rendering) return;
    const el = e.target;
    if (["language", "settings-language", "theme", "width"].includes(el.id)) {
      s[el.id === "settings-language" ? "language" : el.id] = el.value;
      render();
      return;
    }
    if (el.id === "outcome") {
      s.outcome = el.value;
      store();
      return;
    }
    if (el.id === "rehearsal") {
      s.rehearsal = el.value;
      start(s.example, "review");
      return;
    }
    if (el.id === "example") {
      start(el.value, "upload");
      return;
    }
    if (el.id === "file-picker") {
      s.selectedFile = el.files?.[0]?.name || "";
      if (el.files?.[0]?.size > 20 * 1024 * 1024) {
        s.selectedFile = "";
        toast(
          "File is larger than the assumed 20 MB limit.",
          "Fayil ya fi iyakar MB 20 da aka ɗauka.",
        );
      }
      render();
      return;
    }
    if (el.id === "scenario") {
      s.scenario = el.value;
      if (el.value === "short") start("po", "review");
      else if (el.value === "unreadable") go("unreadable");
      else if (el.value === "limit") go("limit");
      else if (el.value === "offline") go("offline");
      else if (el.value === "low") {
        s.rows[0].status = "unresolved";
        s.rows[0].issue = "duplicate";
        s.rows[0].confidence = 51;
        s.rows[0].selected = false;
        go("review");
      } else {
        start(s.example, "review");
      }
      render();
      return;
    }
    if (el.id === "role") {
      s.role = el.value;
      go(s.role === "Owner" ? "home" : "no-access");
      render();
      return;
    }
    if (el.id === "plan") {
      s.plan = el.value;
      go(el.value === "Starter" ? "plan" : "settings");
      render();
      return;
    }
    if (el.id === "column-confirm") {
      s.columnConfirmed = el.checked;
      s.rows.forEach(r => r.selected = false);
      s.authorizedRevision = null;
      render();
      return;
    }
    if (el.dataset.selectRow) {
      const r = s.rows.find((x) => x.id === +el.dataset.selectRow);
      r.selected = el.checked;
      s.authorizedRevision = null;
      store();
      render();
      return;
    }
    if (el.dataset.zero) {
      updateRow(el.dataset.zero, (r) => {
        r.acceptMissing = el.checked;
        r.cost = el.checked ? 0 : null;
        r.status = el.checked ? "matched" : "unresolved";
        r.issue = el.checked ? "" : "cost";
        r.needsCost = true;
      });
      return;
    }
    if (el.dataset.price) {
      updateRow(el.dataset.price, (r) => (r.usePrice = el.checked));
      return;
    }
    if (el.dataset.field) {
      updateRow(el.dataset.id, (r) => {
        const f = el.dataset.field;
        if (f === "match") {
          if (el.value === "candidate") return;
          if (el.value === "same") { r.name = sourceRow(r).name; r.sku = sourceRow(r).sku; }
          r.newProduct = el.value === "new";
          r.issue = el.value === "ambiguous" ? "duplicate" : "";
          r.status =
            el.value === "ambiguous"
              ? "unresolved"
              : r.newProduct
                ? "new"
                : "matched";
        } else {
          r[f] = ["qty", "cost", "suggested"].includes(f)
            ? el.value === ""
              ? null
              : Number(el.value)
            : el.value;
          if (f === "cost") {
            r.needsCost = r.cost === null;
            r.acceptMissing = false;
            if (r.issue === "cost" && r.cost !== null) r.issue = "";
          }
          if (
            r.qty > 0 &&
            r.unit !== "choose" &&
            r.cost !== null &&
            !["price", "unexpected", "duplicate", "unit"].includes(r.issue)
          ) {
            r.status = r.newProduct ? "new" : "matched";
            r.issue = "";
          }
          if (!r.qty || r.qty < 0) {
            r.status = "unresolved";
            r.issue = "invalid";
          }
          if (r.cost === null) {
            r.status = "unresolved";
            r.issue = "cost";
          }
        }
      });
      return;
    }
    if (el.dataset.setting) {
      s.switches[el.dataset.setting] = el.checked;
      store();
      toast("Prototype setting saved.", "An ajiye saitin gwaji.");
      return;
    }
    if (el.dataset.sharing) {
      const k = el.dataset.sharing;
      if (el.checked) {
        el.checked = false;
        showDialog(
          T("Choose what you share", "Zaɓi abin da za a raba"),
          `<span class="assumption-tag">ASSUMPTION Q08</span><p class="spaced">${T(k === "quality" ? "Allow usage and quality signals only. No invoices, customer data or sales figures." : k === "aggregates" ? "Allow selected anonymized business totals. Exact fields and anonymization must be reviewed before implementation." : "Allow requests to share a specific document. This is not permission to share any document now.", k === "quality" ? "Bayanan amfani da inganci kaɗai. Babu invoice ko kuɗin shiga." : k === "aggregates" ? "Taƙaitattun jimilloli marasa suna. Sai an duba ainihin bayanan." : "Izinin tambaya game da takarda. Ba izinin rabawa yanzu ba ne.")}</p>`,
          btn(
            T("Allow this tier in demo", "Amince da matakin a gwaji"),
            "consent-yes",
            true,
            `data-tier="${k}"`,
          ) + btn(T("Keep off", "Bar a kashe"), "close-dialog"),
        );
      } else {
        s.sharing[k] = false;
        store();
        toast(
          "Consent revoked. Future sharing is stopped in the demo.",
          "An janye izini. An dakatar da rabawa na gaba a gwaji.",
        );
      }
      return;
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "paste") {
      s.paste = e.target.value;
      store();
    }
  });
  document.addEventListener("toggle", e => {
    if (e.target.matches?.("details[data-confident]") && e.target.isConnected) {
      s.expandedConfident = e.target.open;
      store();
    }
  }, true);
  document.addEventListener("click", (e) => {
    if (e.target.closest("a.skip")) {
      e.preventDefault();
      $("#main").focus();
      return;
    }
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action,
      id = b.dataset.id;
    if (a === "close-dialog") {
      closeDialog();
      return;
    }
    if (a === "assumptions") {
      assumptions(b.dataset.q);
      return;
    }
    if (a === "stock-in") {
      showDialog(
        T("How would you like to add stock?", "Ta yaya kake son ƙara haja?"),
        `<p class="muted">${T("Keep your normal Stock In flow, or prepare a draft from a document.", "Yi karɓar haja ta hannu ko shirya daftari daga takarda.")}</p><div class="panel spaced"><h3>${T("Receive with AI", "Karɓa da AI")}</h3><p class="spaced">${T("Photo, file or list → review → apply", "Hoto, fayil ko jerin kaya → dubawa → ajiya")}</p></div>`,
        btn(T("Prepare with AI", "Shirya da AI"), "entry-ai", true) +
          btn(T("Enter manually", "Shigar da hannu"), "manual"),
      );
      return;
    }
    if (a === "entry-ai") {
      closeDialog();
      if (!s.saved) start("oil", "upload");
      else go("upload");
      return;
    }
    if (a === "start-po") {
      start("po", "upload");
      return;
    }
    if (a === "start-sheet") {
      start("sheet", "upload");
      return;
    }
    if (a === "tab") {
      s.tab = b.dataset.tab;
      render();
      return;
    }
    if (a === "prepare") {
      s.saved = true;
      s.stage = 0;
      if (s.tab === "paste" && s.paste.trim()) s.example = "whatsapp";
      s.rows = fixtures(s.example);
      seedRehearsal();
      store();
      if (s.scenario === "offline") {
        s.offlineKind = "upload";
        go("offline");
      } else if (s.scenario === "limit") go("limit");
      else go("processing");
      return;
    }
    if (a === "next-stage") {
      advance(false);
      return;
    }
    if (a === "apply-stage") {
      advance(true);
      return;
    }
    if (a === "row-details") {
      const n = +id;
      s.openRows = s.openRows.includes(n)
        ? s.openRows.filter((x) => x !== n)
        : [...s.openRows, n];
      render();
      return;
    }
    if (a === "unit-pieces" || a === "unit-carton") {
      updateRow(id, (r) => {
        r.qty = a === "unit-pieces" ? 50 : 1;
        r.unit = a === "unit-pieces" ? "piece" : "carton";
        r.cost = a === "unit-pieces" ? 190 : 9500;
        if (a === "unit-carton") {
          r.newProduct = true;
          r.sku = "GINO-CTN-50";
          r.current = null;
          r.suggested = 12000;
          r.usePrice = true;
        }
        r.issue = "";
        r.status = r.newProduct ? "new" : "matched";
        r.confidence = 100;
      });
      return;
    }
    if (a === "resolve-price") {
      updateRow(id, (r) => {
        r.issue = "";
        r.status = "matched";
        r.confidence = 100;
      });
      return;
    }
    if (a === "include") {
      updateRow(id, (r) => {
        r.issue = "";
        r.status = "new";
      });
      return;
    }
    if (a === "skip-row") {
      updateRow(id, (r) => {
        r.status = "skipped";
        r.issue = "";
      });
      return;
    }
    if (a === "approve-confident") {
      s.rows.forEach((r) => {
        if (valid(r) && !r.newProduct && !r.needsCost && !r.applied) r.selected = true;
      });
      store();
      render();
      return;
    }
    if (a === "more") {
      s.limits[b.dataset.group] = (s.limits[b.dataset.group] || 10) + 10;
      render();
      return;
    }
    if (a === "confirm") {
      if (chosen().length && (s.example !== "sheet" || s.columnConfirmed)) go("confirm");
      return;
    }
    if (a === "apply") {
      if (route() !== "confirm" || !chosen().length || (s.example === "sheet" && !s.columnConfirmed)) return;
      s.authorizedRevision = s.revision;
      s.stage = 0;
      if (s.scenario === "offline") {
        s.offlineKind = "approval";
        go("offline");
      } else go("applying");
      return;
    }
    if (a === "leave") {
      s.saved = true;
      store();
      go("drafts");
      return;
    }
    if (a === "cancel") {
      showDialog(
        T("Cancel the unfinished work?", "A soke aikin da bai ƙare ba?"),
        `<p>${T("Already applied rows stay saved. Unapplied rows will close.", "Layukan da aka yi sun tsaya ajiye. Za a rufe sauran.")}</p>`,
        btn(
          T("Cancel unfinished work", "Soke aikin da bai ƙare ba"),
          "confirm-cancel",
          true,
        ) + btn(T("Keep reviewing", "Ci gaba da dubawa"), "close-dialog"),
      );
      return;
    }
    if (a === "confirm-cancel") {
      closeDialog();
      s.rows.forEach((r) => {
        if (!r.applied) r.status = "skipped";
      });
      go("cancelled");
      return;
    }
    if (a === "reconnect") {
      s.scenario = "normal";
      go("recheck");
      return;
    }
    if (a === "recheck") {
      if (s.offlineKind === "upload") {
        s.stage = 0;
        go("processing");
      } else go("conflict");
      return;
    }
    if (a === "accept-conflict") {
      s.changeAccepted = true;
      s.rows[0].stock = 18;
      s.rows.forEach((r) => (r.selected = false));
      s.authorizedRevision = null;
      s.revision++;
      go("review");
      return;
    }
    if (a === "lookup") {
      if (s.authorizedRevision !== s.revision && !s.applied) {
        go("review");
        toast("No submitted receipt to check. Your draft is still unapplied.", "Babu karɓar da aka aika don dubawa. Ba a aiwatar da daftari ba.");
        return;
      }
      commit(false);
      go("result");
      return;
    }
    if (a === "separate") {
      start(s.example, "upload");
      toast(
        "Separate synthetic delivery started.",
        "An fara wani karɓa na kwaikwayo.",
      );
      return;
    }
    if (a === "retake") {
      s.scenario = "normal";
      s.tab = "camera";
      go("upload");
      return;
    }
    if (a === "manual-line") {
      s.scenario = "normal";
      s.openRows = [3];
      go("review");
      return;
    }
    if (a === "apply-repair") {
      if (route() !== "repair" || !s.rows.some(r => r.failed)) return;
      const r = s.rows.find((r) => r.failed) || s.rows[1];
      if (r) {
        r.failed = false;
        r.selected = true;
        r.status = "matched";
        r.issue = "";
        r.newProduct = false;
        r.current = r.current ?? 7200;
        r.usePrice = false;
      }
      s.revision++;
      s.authorizedRevision = s.revision;
      commit(false);
      go("result");
      return;
    }
    if (a === "support-preview") {
      const raw = $("#support-doc").checked,
        details = $("#support-row").checked,
        includeError = $("#support-errors").checked;
      showDialog(
        T("Support message preview", "Dubawar saƙon taimako"),
        `<span class="assumption-tag">ASSUMPTION Q08</span><p class="spaced">${includeError ? "TK-DEMO-1042 · duplicate SKU" : T("Error context excluded.", "Ba a haɗa bayanin kuskure ba.")}</p><p>${details ? "Kings Veg Oil 3L · 10 units · ₦6,200" : T("Product, quantity and cost are not included.", "Ba a haɗa kaya, adadi da kuɗin saye ba.")}</p><p>${raw ? T("One SYNTHETIC invoice included with this item-specific choice.", "Invoice ɗaya na kwaikwayo aka zaɓa.") : T("No document included.", "Ba a haɗa takarda ba.")}</p><p class="muted">${T("No message is sent by this prototype.", "Wannan gwaji ba ya aika saƙo.")}</p>`,
        btn(T("Finish preview", "Gama dubawa"), "close-dialog", true),
      );
      return;
    }
    if (a === "metric-source") {
      showDialog(
        T("Records behind this figure", "Bayanan tushen wannan lissafi"),
        `<span class="badge">SYNTHETIC</span><p class="spaced">${T("1,204 completed sample sales · selected warehouse and period. Reversals excluded from revenue; unknown costs excluded from profit.", "Tallace-tallace 1,204 na misali · sito da lokacin da aka zaɓa. An ware mayarwa da kuɗin saye da ba a sani ba.")}</p><p>SALE-DEMO-001 · 26 Oct · ₦4,100<br>SALE-DEMO-002 · 26 Oct · ₦5,300<br>SALE-DEMO-003 · 27 Oct · ₦3,400</p>${tag("Q12", T("Reconciled definitions still require approval.", "Ana jiran amincewar ma’anar lissafi."))}`,
      );
      return;
    }
    if (a === "export") {
      window.print();
      return;
    }
    if (a.startsWith("draft-")) {
      const transfer = a === "draft-transfer";
      showDialog(
        T("Review this proposed action", "Duba wannan shawarar aiki"),
        `<span class="state">reviewing</span><h3 class="spaced">${transfer ? T("Move 40 Peak Milk: Main → Kano", "Tura Peak Milk 40: Main → Kano") : a === "draft-po" ? T("Create a purchase-order draft for 60 Peak Milk", "Ƙirƙiri daftarin PO na Peak Milk 60") : T("Add Peak Milk to a restock list", "Ƙara Peak Milk a jerin cika haja")}</h3><p class="spaced muted">${T("SYNTHETIC · no order is sent and no transfer is received. Only the proposed draft would be created.", "SYNTHETIC · ba a aika oda ko karɓar turawa ba. Daftarin shawara kaɗai za a ƙirƙira.")}</p>${tag("Q11", T("Requires the approved domain foundation.", "Yana buƙatar tsari da aka amince."))}`,
        btn(
          T("Approve draft in demo", "Amince da daftari a gwaji"),
          "approve-action",
          true,
        ) + btn(T("Keep reviewing", "Ci gaba da dubawa"), "close-dialog"),
      );
      return;
    }
    if (a === "approve-action") {
      closeDialog();
      toast(
        "Draft approved in the prototype only. Nothing was sent or moved.",
        "An amince da daftari a gwaji kaɗai. Ba a tura kaya ba.",
      );
      return;
    }
    if (a === "chat-compare" || a === "chat-stock") {
      s.chat.push({
        q: T(
          a === "chat-compare"
            ? "And compared to August?"
            : "Which are running low?",
          a === "chat-compare"
            ? "Yaya idan aka kwatanta da Agusta?"
            : "Waɗanne suna ƙarewa?",
        ),
        kind: a === "chat-compare" ? "compare" : "stock",
      });
      render();
      return;
    }
    if (a === "consent-yes") {
      s.sharing[b.dataset.tier] = true;
      closeDialog();
      store();
      render();
      toast(
        "Demo consent saved. No data is sent.",
        "An ajiye izinin gwaji. Ba a aika bayanai ba.",
      );
      return;
    }
    if (a === "edit-memory" || a === "add-memory") {
      const m = s.learned.find((x) => x.id === +id) || { name: "", value: "" };
      showDialog(
        T("Edit learned item", "Gyara abin da aka koya"),
        `<label>${T("Product or alias", "Kaya ko laƙabi")}<input id="memory-name" value="${esc(m.name)}"></label><label class="spaced">${T("Approved convention", "Ma’aunin da aka amince")}<input id="memory-value" value="${esc(m.value)}"></label><p class="caption muted spaced">${T("Only your shop. Editing invalidates affected approvals.", "Shagonka kaɗai. Gyara yana soke izinin da abin ya shafa.")}</p>`,
        btn(
          T("Save item", "Ajiye abin da aka koya"),
          "save-memory",
          true,
          `data-id="${id || ""}"`,
        ),
      );
      return;
    }
    if (a === "save-memory") {
      const n = $("#memory-name").value.trim(),
        v = $("#memory-value").value.trim();
      if (!n || !v) return;
      const m = s.learned.find((x) => x.id === +id);
      if (m) {
        m.name = n;
        m.value = v;
      } else
        s.learned.push({
          id: Date.now(),
          name: n,
          value: v,
          kind: "Owner convention",
        });
      s.rows.forEach((r) => (r.selected = false));
      s.authorizedRevision = null;
      s.revision++;
      closeDialog();
      store();
      render();
      return;
    }
    if (a === "delete-memory") {
      showDialog(
        T("Forget this learned item?", "A manta da wannan abin da aka koya?"),
        `<p>${T("Future drafts will ask again. Past applied changes stay in the audit record.", "Za a sake tambaya a gaba. Ayyukan da aka yi sun tsaya a tarihi.")}</p>`,
        btn(
          T("Delete learned item", "Goge abin da aka koya"),
          "confirm-delete-memory",
          true,
          `data-id="${id}"`,
        ) + btn(T("Keep item", "Riƙe abin"), "close-dialog"),
      );
      return;
    }
    if (a === "confirm-delete-memory") {
      s.learned = s.learned.filter((m) => m.id !== +id);
      s.rows.forEach((r) => (r.selected = false));
      s.authorizedRevision = null;
      s.revision++;
      closeDialog();
      store();
      render();
      return;
    }
    if (a.startsWith("role-")) {
      s.role =
        a === "role-owner" ? "Owner" : a === "role-admin" ? "Admin" : "Cashier";
      go(s.role === "Owner" ? "home" : "no-access");
      render();
      return;
    }
    if (a === "normal-work") {
      showDialog(
        T("Your normal workspace", "Wurin aikinka na kullum"),
        `<p>${T("Cashiers keep POS access; Admins keep their existing manual workflows and reports. The AI assistant is Owner-only.", "Masu kuɗi suna da POS; Admin suna da aikin hannu da rahotanni. AI na mai kasuwanci kaɗai.")}</p>`,
        btn(T("Close preview", "Rufe dubawa"), "close-dialog", true),
      );
      return;
    }
    if (a === "plan-options") {
      showDialog(
        T("Plan eligibility preview", "Dubawar izinin tsari"),
        `<span class="assumption-tag">ASSUMPTION Q02</span><p class="spaced">${T("D2 excludes Starter. Growth, Business and Enterprise are shown as eligible. Free, trial and legacy behavior still need a decision; no price or upgrade is offered here.", "D2 ya cire Starter. Ana nuna Growth, Business da Enterprise masu izini. Ana jiran shawarar Free, gwaji da tsofaffi.")}</p>`,
        btn(T("Close preview", "Rufe dubawa"), "close-dialog", true),
      );
      return;
    }
    if (a === "manual") {
      showDialog(
        T(
          "Manual Stock In stays available",
          "Shigar da haja da hannu yana nan",
        ),
        `<p>${T("This is the handoff to the existing manual workflow, outside this AI prototype. No manual data is saved here.", "Wannan zai koma hanyar hannu da take nan, a wajen wannan gwaji. Ba a ajiye bayanan hannu a nan ba.")}</p>`,
        btn(T("Back to inventory", "Koma haja"), "manual-back", true),
      );
      return;
    }
    if (a === "manual-back") {
      closeDialog();
      go("inventory");
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id === "chat-form") {
      e.preventDefault();
      const q = $("#question").value.trim();
      if (!q) return;
      const kind = /august|agusta|compar|kwatanta/i.test(q)
        ? "compare"
        : /stock|low|ƙare|haja|restock/i.test(q)
          ? "stock"
          : "offtopic";
      s.chat.push({ q, kind });
      store();
      render();
    }
  });
  $("#controls-toggle").addEventListener("click", () => {
    $("#controls").hidden = !$("#controls").hidden;
    $("#controls-toggle").setAttribute(
      "aria-expanded",
      String(!$("#controls").hidden),
    );
  });
  $("#reset").addEventListener("click", () => {
    s = JSON.parse(JSON.stringify(base));
    s.rows = fixtures("oil");
    store();
    go("home");
    render();
    toast("Synthetic demo reset.", "An sake saita gwajin kwaikwayo.");
  });
  $("#detail-dialog").addEventListener("click", (e) => {
    if (e.target === $("#detail-dialog")) closeDialog();
  });
  window.addEventListener("hashchange", render);
  window.prototypeDemo = {
    get state() {
      return s;
    },
    routes: routes.map((r) => r[0]),
    start,
    go,
    setOutcome(v) {
      s.outcome = v;
      store();
    },
    render,
  };
  render();
})();
