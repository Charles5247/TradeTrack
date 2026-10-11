import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/shared/query-provider";
import { ServiceWorkerRegister } from "@/components/shared/sw-register";
import { AuthProvider } from "@/components/auth/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import { cookies } from "next/headers";
import { isLocale } from '@/i18n/locale';
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://trackasuwa.vercel.app"),
  title: {
    default: "TracKasuwa | POS & Inventory for Nigerian Retailers",
    template: "%s | TracKasuwa",
  },
  description:
    "Offline-first POS and inventory management built for Nigerian retailers. Record sales, track stock, and keep your business moving, even without internet.",
  keywords: [
    "POS software Nigeria",
    "inventory management Nigeria",
    "offline POS",
    "retail management",
    "stock tracking",
    "TracKasuwa",
  ],
  authors: [{ name: "TracKasuwa" }],
  creator: "CAXiE Technologies Limited",
  publisher: "CAXiE Technologies Limited",
  applicationName: "TracKasuwa",
  alternates: {
    canonical: "https://trackasuwa.vercel.app/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TracKasuwa",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://trackasuwa.vercel.app/",
    title: "TracKasuwa | POS & Inventory for Nigerian Retailers",
    description:
      "Offline-first POS and inventory management built for Nigerian retailers. Record sales, track stock, and keep your business moving, even without internet.",
    siteName: "TracKasuwa",
    images: [
      {
        url: "/brand/social-preview.png",
        width: 1200,
        height: 630,
        alt: "TracKasuwa — Point of sale and inventory management",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TracKasuwa | POS & Inventory for Nigerian Retailers",
    description:
      "Offline-first POS and inventory management built for Nigerian retailers. Record sales, track stock, and keep your business moving, even without internet.",
    images: ["/brand/social-preview.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=6", sizes: "any" },
      { url: "/icons/favicon-48x48.png?v=6", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192x192.png?v=6", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png?v=6",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  // Matches Retail design tokens (README §4.1/4.2): --c-bg light / dark.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0858F8" },
    { media: "(prefers-color-scheme: dark)", color: "#081868" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Determine the initial locale from a cookie (default to English)
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get('NEXT_LOCALE')?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : 'en';

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('theme');
                  if (stored === 'dark' || stored === 'light') {
                    document.documentElement.classList.toggle('dark', stored === 'dark');
                  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className="font-sans"
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <I18nProvider defaultLocale={locale}>
                <TooltipProvider delayDuration={200}>
                  {children}
                  <Toaster
                    position="top-right"
                    richColors
                    closeButton
                    duration={4000}
                  />
                  <ServiceWorkerRegister />
                </TooltipProvider>
              </I18nProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
