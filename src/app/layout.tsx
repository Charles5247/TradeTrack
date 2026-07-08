import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/components/shared/query-provider';
import { AuthProvider } from '@/components/auth/auth-provider';
import { I18nProvider } from '@/i18n';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'TradeTrack - POS & Inventory Management',
    template: '%s | TradeTrack',
  },
  description: 'Enterprise offline-first POS and inventory management system for Nigerian market traders',
  keywords: ['POS', 'inventory', 'Nigeria', 'trade', 'business', 'offline'],
  authors: [{ name: 'TradeTrack' }],
  creator: 'TradeTrack',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TradeTrack',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: 'https://tradetrack.ng',
    title: 'TradeTrack - POS & Inventory Management',
    description: 'Enterprise offline-first POS and inventory management for Nigerian businesses',
    siteName: 'TradeTrack',
  },
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <I18nProvider>
                {children}
                <Toaster
                  position="top-right"
                  richColors
                  closeButton
                  duration={4000}
                />
              </I18nProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
