import Link from "next/link";
import { ArrowRight, Store, ScanLine, ChartNoAxesCombined } from "lucide-react";
import { TranslatedText as T } from "@/i18n/text";

const steps = [
  { icon: Store, title: "Set up your shop", body: "Create your account online, add your products and get your team ready.", href: "/signup", action: "Start your free trial" },
  { icon: ScanLine, title: "Make your first sale", body: "Record sales and track stock from your phone or computer, even when the network drops.", href: "/download", action: "Get the app" },
  { icon: ChartNoAxesCombined, title: "Know what to do next", body: "Review sales, stock and staff activity. Use your records to make your next business decision.", href: "/features", action: "Explore the tools" },
];

export function GettingStarted() {
  return <section id="how-it-works" className="scroll-mt-24 border-b border-border py-14 sm:py-20">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="max-w-2xl"><p className="tt-eyebrow text-primary"><T text="From setup to your next sale" /></p><h2 className="market-display mt-4 text-3xl sm:text-4xl"><T text="A clearer way to run your shop." /></h2><p className="mt-4 text-muted-foreground"><T text="Start with the essentials. Build better business habits as you grow." /></p></div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {steps.map(({icon: Icon,title,body,href,action},i) => <article key={title} className="flex flex-col rounded-xl border border-border bg-card p-6"><div className="mb-6 flex items-center justify-between"><Icon className="h-6 w-6 text-primary" /><span className="text-sm font-medium tabular-nums text-muted-foreground">0{i+1}</span></div><h3 className="text-lg font-semibold"><T text={title} /></h3><p className="mb-6 mt-3 text-sm leading-relaxed text-muted-foreground"><T text={body} /></p><Link href={href} className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><T text={action} /><ArrowRight className="h-4 w-4" /></Link></article>)}
      </div>
      <div className="mt-8 flex flex-col justify-between gap-5 rounded-xl border border-border bg-secondary p-6 sm:flex-row sm:items-center"><div><h3 className="font-semibold"><T text="Building the future of everyday commerce?" /></h3><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground"><T text="For investors and partners: explore our product, meet the team and discuss how better retail records can support growing businesses." /></p></div><Link href="/contact" className="inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold text-primary"><T text="Let's talk" /><ArrowRight className="h-4 w-4" /></Link></div>
    </div>
  </section>;
}
