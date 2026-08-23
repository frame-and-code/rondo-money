import { ThemeProvider } from '@rondo/ui/components/theme-provider';
import { Inter } from 'next/font/google';
import './globals.css';

import { ClerkProviderLocalized } from '@/components/clerk-provider-localized';
import { LocaleProvider } from '@/i18n/locale-context';
import { SettingsLocaleSync } from '@/i18n/settings-locale';
import { ApiProvider } from '@/lib/api';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Rondo Money',
  description: 'Zero-based budgeting: every unit of money gets a job before it is spent.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <ClerkProviderLocalized>
            <ApiProvider>
              <SettingsLocaleSync />
              <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
                {children}
              </ThemeProvider>
            </ApiProvider>
          </ClerkProviderLocalized>
        </LocaleProvider>
      </body>
    </html>
  );
}
