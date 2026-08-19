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

// Root layout for the whole App Router tree. `lang` starts as the default locale — English
// since F1.6, matching what the API falls back to — and `LocaleProvider` corrects both it and
// the rendered strings client-side from the user's own stored choice, their settings and their
// browser, in that order. So, like the theme class below, it deliberately won't match between
// the SSR markup and the first client paint; `suppressHydrationWarning` covers both, since
// next-themes sets the theme class via a pre-hydration inline script and `LocaleProvider` sets
// `lang` in an effect right after mount.
// `SettingsLocaleSync` renders nothing: it is inside `ApiProvider` because that is where the
// query client and the token are, and it feeds the locale back up to `LocaleProvider` (F1.6).
// Route protection is NOT here: proxy.ts (clerkMiddleware + auth.protect) redirects
// anonymous requests to /sign-in before any page renders (F1.1).
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
