"use client";

import React from "react";
import { BarChart3, Package, ReceiptText, ShoppingCart, WifiOff } from "lucide-react";
import { TranslatedText } from "@/i18n/text";
import { Reveal } from "@/components/marketing/reveal";

const demos = {
  pos: {
    label: "Point of Sale",
    icon: ShoppingCart,
    title: "Checkout in a few taps",
    detail: "Scan a product, confirm quantities, split payment if needed, and print or share the receipt.",
    metric: "₦14,500",
    metricLabel: "Sample checkout",
  },
  stock: {
    label: "Inventory",
    icon: Package,
    title: "Know what needs restocking",
    detail: "Set reorder levels, track quantities by location, and see low-stock items before shelves run empty.",
    metric: "6 items",
    metricLabel: "Below reorder level",
  },
  reports: {
    label: "Reports",
    icon: BarChart3,
    title: "Turn sales into decisions",
    detail: "Review daily performance, revenue and stock movement without turning records into manual spreadsheets.",
    metric: "₦148,500",
    metricLabel: "Sample sales today",
  },
};

export function ServiceCommitments() {
  const commitments = [
    { title: "30-day full trial", detail: "Try the full Business experience before choosing a paid plan. No payment is required to start." },
    { title: "Your data stays yours", detail: "Keep access to existing records after a trial ends, and use product, sales and reporting workflows you control." },
    { title: "Offline continuity", detail: "Keep working on supported workflows when connectivity drops, then sync when connection returns." },
    { title: "Naira-first billing", detail: "Clear monthly, quarterly, six-month and yearly billing through Zainpay with a plan expiry tied to your selected period." },
  ];

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mb-8 max-w-2xl">
            <div className="tt-eyebrow mb-3"><TranslatedText text="Our service commitments" /></div>
            <h2 className="tt-head text-3xl leading-tight sm:text-4xl"><TranslatedText text="Built around accountable everyday trading." /></h2>
          </div>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {commitments.map((item, i) => (
            <Reveal key={item.title} delay={i * 60}>
              <div className="h-full rounded-xl border border-border bg-card p-5">
                <div className="text-primary text-sm font-semibold">0{i + 1}</div>
                <h3 className="mt-4 font-semibold"><TranslatedText text={item.title} /></h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground"><TranslatedText text={item.detail} /></p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function InteractiveProductDemo() {
  const [active, setActive] = React.useState<keyof typeof demos>("pos");
  const demo = demos[active];
  const Icon = demo.icon;
  const sampleProducts = [
    { id: "coke", name: "Coca-Cola", piece: "Bottle", pack: "Crate", packSize: 12, price: 350, stockPieces: 48 },
    { id: "rice", name: "Local Rice", piece: "Mudu / Cup", pack: "Bag", packSize: 50, price: 500, stockPieces: 150 },
    { id: "soap", name: "Laundry Soap", piece: "Piece", pack: "Carton", packSize: 24, price: 250, stockPieces: 72 },
  ] as const;
  const [cart, setCart] = React.useState<Array<{ id: string; unit: "piece" | "pack"; quantity: number }>>([]);
  const [stock, setStock] = React.useState<Record<string, number>>({ coke: 48, rice: 150, soap: 72 });
  const [receipt, setReceipt] = React.useState(false);

  const cartTotal = cart.reduce((total, line) => {
    const product = sampleProducts.find((item) => item.id === line.id);
    if (!product) return total;
    const lineTotal = line.unit === "pack"
      ? product.price * product.packSize * 0.95 * line.quantity
      : product.price * line.quantity;
    return total + lineTotal;
  }, 0);

  function addProduct(id: typeof sampleProducts[number]["id"], unit: "piece" | "pack") {
    setReceipt(false);
    setCart((current) => {
      const existing = current.find((line) => line.id === id && line.unit === unit);
      if (existing) return current.map((line) => line.id === id && line.unit === unit ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, { id, unit, quantity: 1 }];
    });
  }

  function changeQuantity(id: string, unit: "piece" | "pack", delta: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.id !== id || line.unit !== unit) return [line];
      const quantity = line.quantity + delta;
      return quantity > 0 ? [{ ...line, quantity }] : [];
    }));
  }

  function completeSale() {
    if (cart.length === 0) return;
    const reductions: Record<string, number> = {};
    cart.forEach((line) => {
      const product = sampleProducts.find((item) => item.id === line.id);
      if (!product) return;
      reductions[line.id] = (reductions[line.id] ?? 0) + line.quantity * (line.unit === "pack" ? product.packSize : 1);
    });
    if (Object.entries(reductions).some(([id, quantity]) => quantity > (stock[id] ?? 0))) return;
    setStock((current) => Object.fromEntries(Object.entries(current).map(([id, quantity]) => [id, quantity - (reductions[id] ?? 0)])));
    setReceipt(true);
  }

  const insufficientStock = sampleProducts.some((product) => {
    const requiredPieces = cart.reduce((total, line) => {
      if (line.id !== product.id) return total;
      return total + line.quantity * (line.unit === "pack" ? product.packSize : 1);
    }, 0);
    return requiredPieces > stock[product.id];
  });

  return (
    <section className="border-y border-border bg-[var(--c-bgAlt)] py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="mx-auto mb-10 max-w-3xl text-center">
            <div className="tt-eyebrow mb-3"><TranslatedText text="See TracKasuwa in action" /></div>
            <h2 className="tt-head text-[clamp(32px,4vw,48px)] leading-[1.05]"><TranslatedText text="One clear workflow, from sale to insight." /></h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground"><TranslatedText text="Explore a sample POS, inventory and reporting workflow. The figures below are illustrative." /></p>
          </div>
        </Reveal>

        <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5 lg:grid-cols-[220px_1fr]">
          <div className="flex max-w-full gap-2 overflow-x-auto border-b border-border p-3 lg:overflow-visible lg:flex-col lg:border-b-0 lg:border-r lg:p-4">
            {(Object.keys(demos) as Array<keyof typeof demos>).map((key) => {
              const item = demos[key];
              const ItemIcon = item.icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(key)}
                  className={`flex min-w-[132px] shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-colors lg:min-w-0 lg:w-full lg:flex-none ${active === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                >
                  <ItemIcon className="h-4 w-4" />
                  <TranslatedText text={item.label} />
                </button>
              );
            })}
          </div>

          <div className="grid min-h-[430px] gap-6 p-5 sm:p-8 md:grid-cols-[0.8fr_1.2fr] md:items-center">
            <div>
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
              <h3 className="text-2xl font-semibold"><TranslatedText text={demo.title} /></h3>
              <p className="mt-3 leading-relaxed text-muted-foreground"><TranslatedText text={demo.detail} /></p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-muted-foreground"><WifiOff className="h-3.5 w-3.5" /><TranslatedText text="Offline-ready workflow" /></div>
            </div>

            {active === "pos" ? (
              <div className="rounded-xl border border-border bg-[var(--c-bgAlt)] p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between border-b border-border pb-3 text-sm"><span className="font-semibold">Sample checkout</span><span className="rounded-full bg-secondary px-2.5 py-1 text-xs">No real payment</span></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    {sampleProducts.map((product) => (
                      <div key={product.id} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{product.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{stock[product.id]} base pieces available</p></div><p className="text-xs font-medium tabular-nums">₦{product.price.toLocaleString()} / piece</p></div>
                        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => addProduct(product.id, "piece")} className="rounded-md border border-border px-2 py-2 text-xs font-semibold hover:bg-secondary">Add {product.piece}</button><button type="button" onClick={() => addProduct(product.id, "pack")} className="rounded-md bg-primary px-2 py-2 text-xs font-semibold text-primary-foreground">Add {product.pack}</button></div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="mb-3 text-sm font-semibold">Sale items</p>
                    <div className="min-h-[176px] space-y-2">{cart.length === 0 ? <p className="py-12 text-center text-xs text-muted-foreground">Add a product to begin</p> : cart.map((line) => { const product = sampleProducts.find((item) => item.id === line.id)!; return <div key={`${line.id}-${line.unit}`} className="flex items-center gap-2 border-b border-border pb-2 text-xs last:border-0"><div className="min-w-0 flex-1"><p className="truncate font-medium">{product.name}</p><p className="text-muted-foreground">{line.unit === "pack" ? `${product.pack} × ${product.packSize}` : product.piece}</p></div><button type="button" aria-label="Decrease quantity" onClick={() => changeQuantity(line.id, line.unit, -1)} className="rounded border border-border px-2 py-1">−</button><span className="w-4 text-center tabular-nums">{line.quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => changeQuantity(line.id, line.unit, 1)} className="rounded border border-border px-2 py-1">+</button></div>; })}</div>
                    {receipt ? <div className="mb-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700">Sale complete — stock updated</div> : null}
                    {insufficientStock ? <p className="mb-2 text-xs text-destructive">One item exceeds available stock.</p> : null}
                    <div className="flex items-end justify-between border-t border-border pt-3"><span className="text-xs text-muted-foreground">Total</span><span className="text-xl font-semibold tabular-nums">₦{Math.round(cartTotal).toLocaleString()}</span></div>
                    <button type="button" disabled={cart.length === 0 || insufficientStock} onClick={completeSale} className="mt-3 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Complete sale</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-[var(--c-bgAlt)] p-4 sm:p-6">
                <div className="flex items-center justify-between border-b border-border pb-4 text-sm"><span className="font-semibold">TracKasuwa</span><span className="rounded-full bg-secondary px-2.5 py-1 text-xs"><TranslatedText text="Sample data" /></span></div>
                <div className="grid grid-cols-2 gap-3 py-5"><div className="rounded-xl border border-border bg-card p-4"><ReceiptText className="h-4 w-4 text-primary" /><p className="mt-4 text-2xl font-semibold tabular-nums">{demo.metric}</p><p className="mt-1 text-xs text-muted-foreground"><TranslatedText text={demo.metricLabel} /></p></div><div className="rounded-xl border border-border bg-card p-4"><Package className="h-4 w-4 text-primary" /><p className="mt-4 text-2xl font-semibold tabular-nums">{active === "stock" ? "24" : "12"}</p><p className="mt-1 text-xs text-muted-foreground"><TranslatedText text={active === "stock" ? "Products tracked" : "Transactions today"} /></p></div></div>
                <div className="space-y-3 rounded-xl border border-border bg-card p-4">{[["Cash", "₦86,000"], ["Transfer", "₦62,500"]].map(([label, value]) => <div key={label} className="flex justify-between border-b border-border pb-3 text-sm last:border-0 last:pb-0"><span className="text-muted-foreground"><TranslatedText text={label} /></span><span className="font-medium tabular-nums">{value}</span></div>)}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
