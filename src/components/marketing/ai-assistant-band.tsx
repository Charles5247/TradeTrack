import { TranslatedText } from '@/i18n/text';

const features = [
  ['Bulk inventory upload', 'Paste or upload product data. Review the draft before saving.'],
  ['Business insights', 'Ask questions about your own sales and stock records.'],
  ['Owner stays in control', 'Every proposed inventory change needs your approval.'],
  ['Stock analysis and prediction', 'See sales pace and estimated stock coverage from recent records.'],
  ['Follow-up business analytics', 'Ask another question to explore your business records.'],
  ['Staff performance', 'Compare cashier sales and transaction counts.'],
];

export function AIAssistantBand() {
  return <section className="border-y border-border bg-muted/30 py-16 sm:py-24">
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <p className="tt-eyebrow mb-3"><TranslatedText text="Your business assistant" /></p>
      <h2 className="tt-head max-w-3xl text-3xl sm:text-5xl"><TranslatedText text="An AI assistant that works on your shop’s own data" /></h2>
      <p className="mt-4 max-w-2xl text-muted-foreground"><TranslatedText text="Live AI needs an internet connection. Forecasts are estimates, and you review changes before saving." /></p>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{features.map(([title, description]) => <article key={title} className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-lg font-semibold"><TranslatedText text={title} /></h3>
        <p className="mt-2 text-sm text-muted-foreground"><TranslatedText text={description} /></p>
      </article>)}</div>
    </div>
  </section>;
}
