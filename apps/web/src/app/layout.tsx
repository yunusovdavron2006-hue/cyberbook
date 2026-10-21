import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { I18nProvider } from '@/lib/i18n/context';
import { getServerI18n, getLocale } from '@/lib/i18n/server';
import { LocaleAccountBridge } from '@/components/LanguageSelector';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { Footer } from '@/components/Footer';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerI18n();
  return {
    title: t('meta.title'),
    description: t('meta.description'),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Do not disable zoom (accessibility); cap it to avoid accidental blow-ups.
  maximumScale: 5,
  themeColor: '#0b0d14',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <head>
        <link rel="preconnect" href="https://tile.openstreetmap.org" crossOrigin="" />
      </head>
      <body>
        <I18nProvider initialLocale={locale}>
          <AuthProvider>
            <LocaleAccountBridge />
            <Header />
            {/* Padding-bottom leaves room for the fixed mobile bottom nav and the
                iPhone home indicator; reset at md where the nav is hidden. */}
            <main className="mx-auto w-full max-w-shell px-4 py-6 pb-24 md:pb-10">{children}</main>
            <Footer />
            <BottomNav />
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
