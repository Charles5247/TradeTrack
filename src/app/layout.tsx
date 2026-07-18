import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/shared/query-provider";
import { ServiceWorkerRegister } from "@/components/shared/sw-register";
import { AuthProvider } from "@/components/auth/auth-provider";
import { I18nProvider } from "@/i18n";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
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
        {/* Plain script – avoids React's "script inside component" warning */}
        <script
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
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <I18nProvider defaultLocale={locale}>
                {children}
                <Toaster
                  position="top-right"
                  richColors
                  closeButton
                  duration={4000}
                />
                <ServiceWorkerRegister />
              </I18nProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
