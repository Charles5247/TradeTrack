import Link from "next/link";
import { ArrowRight, Check, Package, ReceiptText, WifiOff } from "lucide-react";
import { TranslatedText as T } from "@/i18n/text";

/** Illustrative product preview: never presented as real merchant traction. */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border bg-[var(--c-bgAlt)]">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <p className="tt-eyebrow mb-6 flex items-center gap-2 text-primary"><span className="h-2 w-2 rounded-full bg-primary" /><T text="Built for Nigerian retail" /></p>
          <h1 className="market-display max-w-2xl text-[clamp(2.75rem,5.5vw,4.75rem)] leading-[1.06] tracking-tight">
            <T text="Your shop. Your numbers." /><br /><span className="text-primary"><T text="Your next move." /></span>
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground"><T text="Record every sale, stay on top of stock, and understand your business. Built for the realities of trading in Nigeria — including unreliable internet." /></p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-sm"><T text="Start 30-day free trial" /><ArrowRight className="h-4 w-4" /></Link>
            <Link href="#how-it-works" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-3 font-semibold"><T text="See how it works" /></Link>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {["No payment needed to start", "Android and Windows"].map(text => <span key={text} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 shrink-0 text-primary" /><T text={text} /></span>)}
          </div>
          <p className="mt-7 text-sm text-muted-foreground"><T text="Prefer a guided setup?" />{" "}<Link href="/contact#installation" className="font-semibold text-primary underline underline-offset-4"><T text="Talk to our team" /></Link></p>
        </div>
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-xl shadow-black/5 sm:p-6">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
            <span className="font-semibold">TracKasuwa <span className="text-muted-foreground">/</span> <T text="Overview" /></span>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium"><T text="Sample data" /></span>
          </div>
          <div className="py-5"><p className="text-sm text-muted-foreground"><T text="Today's sales" /></p><p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">₦148,500<span className="ml-2 text-sm font-normal text-muted-foreground">NGN</span></p><p className="mt-2 text-sm text-muted-foreground"><T text="One clear view of your trading day." /></p></div>
          <div className="grid grid-cols-2 gap-3">
            {[{icon: ReceiptText, title:"Sales recorded", value:"24"}, {icon:Package, title:"Items to restock", value:"6"}].map(({icon:Icon,title,value}) => <div key={title} className="rounded-xl border border-border bg-secondary p-4"><Icon className="mb-3 h-5 w-5 text-primary" /><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground"><T text={title} /></p></div>)}
          </div>
          <div className="mt-5 space-y-3">
            {[["Cash","₦86,000"],["Transfer","₦62,500"]].map(([label,value]) => <div key={label} className="flex justify-between border-b border-border pb-3 text-sm"><span className="text-muted-foreground"><T text={label} /></span><span className="font-medium tabular-nums">{value}</span></div>)}
          </div>
          <div className="mt-5 flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold"><T text="Keep selling when the network drops" /></p><p className="mt-1 text-xs leading-relaxed text-muted-foreground"><T text="Set up online first. Record sales offline, then sync when connected." /></p></div></div>
          <p className="mt-3 text-center text-xs text-muted-foreground"><T text="Illustrative preview, not live business results." /></p>
        </div>
      </div>
    </section>
  );
}
