export interface SiteImage {
  src?: string;
  alt: string;
}

export const siteImages = {
  socialPreview: {
    src: "/brand/social-preview.png",
    alt: "TracKasuwa point of sale and inventory management",
  },
  heroMarket: {
    src: "/images/retail/photo-aba-traders.jpg",
    alt: "Traders at a Nigerian market",
  },
  industries: {
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
      src: "/images/retail/photo-african-spices-market.jpg",
      alt: "Products in a market",
    },
    receipt: {
      alt: "Receipt illustration",
    },
  },
} satisfies Record<string, SiteImage | Record<string, SiteImage>>;
