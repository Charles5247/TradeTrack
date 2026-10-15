
import { TranslatedLabel, TranslatedText } from '@/i18n/text';
import { Store, ChefHat, Building2, ShoppingBasket, Croissant, Building, Pill, Warehouse, Factory } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { Badge } from "@/components/ui/badge";
import { SiteImage } from "@/components/shared/site-image";
import { siteImages } from "@/content/images";

const INDUSTRIES = [
 { key: "pharmaceuticals", image: { alt: "Pharmaceutical stock and sales" }, label: "Pharmaceuticals", desc: "Track medicine stock and sales. Prescription and expiry management are not included.", Icon: Pill, live: true },
 { key: "warehousing", image: { alt: "Warehouse inventory" }, label: "Warehousing merchants", desc: "Track stock across warehouses, transfers and sales.", Icon: Warehouse, live: true },
 { key: "manufacturers", image: { alt: "Finished goods inventory" }, label: "Manufacturers", desc: "Track finished-goods stock and sales. Production planning is not available.", Icon: Factory, live: true },
 { key: "bakery", image: siteImages.industries.bakery, label: "Bakeries", desc: "Recipes, batches and production planning.", Icon: Croissant, live: false },
 { key: "mall", image: siteImages.industries.mall, label: "Shopping malls", desc: "Tenants, leases and shared utilities.", Icon: Building, live: false },
  {
    key: "retail", image: siteImages.industries.retail,
    label: "Retail & wholesale",
    desc: "Provision stores, textiles, auto parts, electronics.",
    Icon: Store,
    live: true,
  },
  {
    key: "grocery", image: siteImages.industries.grocery,
    label: "Grocery stores",
    desc: "SKU velocity, low-stock alerts, multi-warehouse tracking.",
    Icon: ShoppingBasket,
    live: true,
  },
  {
    key: "restaurants", image: siteImages.industries.restaurants,
    label: "Restaurants & lounges",
    desc: "Menu, kitchen display, table-side ordering.",
    Icon: ChefHat,
    live: false,
  },
  {
    key: "hotels", image: siteImages.industries.hotels,
    label: "Hotels & hospitality",
    desc: "Rooms, check-in, folios, restaurant rollup.",
    Icon: Building2,
    live: false,
  },
];

export function IndustriesBand() {
  return (
    <section style={{ padding: "100px 0" }}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="flex flex-wrap justify-between items-end gap-10 mb-12">
            <div>
              <div className="tt-eyebrow mb-3"><TranslatedText text={"Industries · one platform"} /></div>
              <h2 className="tt-head" style={{ fontSize: "clamp(28px, 4vw, 48px)", margin: 0, maxWidth: 640, lineHeight: 1.05 }}><TranslatedText text={"Built for shops, warehouses and finished goods."} /></h2>
            </div>
            <p style={{ fontSize: 15, color: "var(--c-textMuted)", maxWidth: 380, lineHeight: 1.6 }}><TranslatedText text={"Production planning and hospitality tools are planned; core inventory and sales tracking are available today."} /></p>
          </div>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map((ind, i) => (
            <Reveal key={ind.key} delay={i * 80}>
              <div className="tt-industry-card rounded-xl border border-border overflow-hidden" style={{ background: "var(--c-surface)" }}>
                <div
                  className="relative"
                  style={{ aspectRatio: "16 / 10" }}
                >
                  <SiteImage image={ind.image} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="tt-head text-lg"><TranslatedLabel>{ind.label}</TranslatedLabel></div>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <ind.Icon className="h-3.5 w-3.5" style={{ color: "var(--c-primary)" }} strokeWidth={1.75} />
                    {ind.live ? (
                      <Badge variant="success"><TranslatedText text={"Available"} /></Badge>
                    ) : (
                      <Badge variant="outline"><TranslatedText text={"Coming soon"} /></Badge>
                    )}
                  </div>
                  <div className="tt-muted text-[13px]" style={{ lineHeight: 1.55 }}><TranslatedLabel>{ind.desc}</TranslatedLabel></div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
