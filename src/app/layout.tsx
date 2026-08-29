import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/shared/query-provider";
import { ServiceWorkerRegister } from "@/components/shared/sw-register";
import { AuthProvider } from "@/components/auth/auth-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { I18nProvider } from "@/i18n";
import { cookies } from "next/headers";
import "./globals.css";

// Retail design system typography (README §4.3): Space Grotesk for
// headings/display, Inter for body, JetBrains Mono for numbers/SKUs/receipts.
// Each is exposed as a CSS variable consumed by globals.css (--font-head,
// --font-body, --font-mono) so the whole app can reference them via
// `var(--font-head)` etc. without re-importing fonts per component.
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-head",
  weight: ["500", "600", "700"],
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "TradeTrack - POS & Inventory Management",
    template: "%s | TradeTrack",
  },
  description:
    "Enterprise offline-first POS and inventory management system for Nigerian market traders",
  keywords: ["POS", "inventory", "Nigeria", "trade", "business", "offline"],
  authors: [{ name: "TradeTrack" }],
  creator: "CAXiE Technologies Limited",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TradeTrack",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://tradetrack.ng",
    title: "TradeTrack - POS & Inventory Management",
    description:
      "Enterprise offline-first POS and inventory management for Nigerian businesses",
    siteName: "TradeTrack",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // Matches Retail design tokens (README §4.1/4.2): --c-bg light / dark.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#232529" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Determine the initial locale from a cookie (default to English)
  const cookieStore = await cookies();
  const locale =
    (cookieStore.get("NEXT_LOCALE")?.value as
      | "en"
      | "ha"
      | "yo"
      | "ig"
      | "pcm") || "en";

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
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.className}`}
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
