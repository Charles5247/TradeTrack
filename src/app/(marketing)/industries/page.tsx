
import { TranslatedText } from '@/i18n/text';
import type { Metadata } from "next";
import { IndustriesBand } from "@/components/marketing/industries-band";
export const metadata: Metadata = { title: "Industries", description: "Retail and grocery tools, with planned hospitality and production extensions." };
export default function IndustriesPage() {
  return <><header className="mx-auto max-w-6xl px-4 pt-16 sm:px-6"><p className="tt-eyebrow mb-4"><TranslatedText text={"TracKasuwa for your business"} /></p><h1 className="tt-page-title"><TranslatedText text={"Built for the way you trade."} /></h1><p className="mt-4 max-w-2xl text-muted-foreground"><TranslatedText text={"From a neighbourhood shop to a growing retail operation, keep sales, stock and your team connected."} /></p></header><IndustriesBand /></>;
}
