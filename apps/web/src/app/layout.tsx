import { ThemeProvider } from '@rondo/ui/components/theme-provider';
import './globals.css';

import { ClerkProviderLocalized } from '@/components/clerk-provider-localized';
import { LocaleProvider } from '@/i18n/locale-context';
import { SettingsLocaleSync } from '@/i18n/settings-locale';
import { ApiProvider } from '@/lib/api';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Rondo Money',
  description: 'Zero-based budgeting — application shell (F0.5).',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <ClerkProviderLocalized>
            <ApiProvider>
              <SettingsLocaleSync />
              <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                {children}
              </ThemeProvider>
            </ApiProvider>
          </ClerkProviderLocalized>
        </LocaleProvider>
      </body>
    </html>
  );
}
