export interface SiteImage {
  src?: string;
  alt: string;
}

export const siteImages = {
  offlineFeature: {
    src: "/images/retail/offline-sales-editorial.webp",
    alt: "Illustrative scene of a Nigerian shopkeeper recording a sale on a tablet",
  },
  socialPreview: {
    src: "/brand/social-preview.png",
    alt: "TracKasuwa point of sale and inventory management",
  },
  heroMarket: {
    src: "/images/retail/photo-aba-traders.jpg",
    alt: "Traders at a Nigerian market",
  },
  industries: {
    pharmaceuticals: {
      src: "/images/retail/pharmacy-editorial.webp",
      alt: "Illustrative scene of a Nigerian pharmacist checking medicine stock",
    },
    warehousing: {
      src: "/images/retail/warehouse-editorial.webp",
      alt: "Illustrative scene of a Nigerian warehouse supervisor scanning cartons",
    },
    manufacturers: {
      src: "/images/retail/manufacturing-editorial.webp",
      alt: "Illustrative scene of Nigerian staff checking finished goods for dispatch",
    },
    bakery: {
      src: "/images/retail/photo-bakery.jpg",
      alt: "Bakery production",
    },
    mall: {
      src: "/images/retail/photo-mall.jpg",
      alt: "Shopping mall",
    },
    retail: {
      src: "/images/retail/photo-market.jpg",
      alt: "Retail and wholesale market",
    },
    grocery: {
      src: "/images/retail/photo-african-spices-market.jpg",
      alt: "Grocery market",
    },
    restaurants: {
      src: "/images/retail/photo-restaurant.jpg",
      alt: "Restaurant service",
    },
    hotels: {
      src: "/images/retail/photo-african-hotel-women.jpg",
      alt: "Hotel hospitality",
    },
  },
  authCarousel: {
    counter: {
      src: "/images/retail/photo-market.jpg",
      alt: "Shop counter",
    },
    pos: {
      src: "/images/retail/photo-aba-traders.jpg",
      alt: "Point of sale at a market",
    },
    warehouse: {
      src: "/images/retail/warehouse-editorial.webp",
      alt: "Illustrative scene of a Nigerian warehouse supervisor scanning cartons",
    },
    receipt: {
      src: "/images/retail/receipt-editorial.webp",
      alt: "Receipt illustration",
    },
  },
} satisfies Record<string, SiteImage | Record<string, SiteImage>>;
