import { ThemeProvider } from '@ffai/ui/components/theme-provider';
import './globals.css';

import { ClerkProviderLocalized } from '@/components/clerk-provider-localized';
import { LocaleProvider } from '@/i18n/locale-context';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Fin Flow AI',
  description: 'Zero-based budgeting — application shell (F0.5).',
};

// Root layout for the whole App Router tree. `lang` starts as the RU default (PRD is
// the RU source of truth) and `LocaleProvider` corrects both it and the rendered
// strings client-side once the browser's language is detected (F0.7) — so, like the
// theme class below, it deliberately won't match between the SSR markup and the first
// client paint. `suppressHydrationWarning` covers both: next-themes sets the theme
// class via a pre-hydration inline script, and `LocaleProvider` sets `lang` in an
// effect right after mount.
// Route protection is NOT here: proxy.ts (clerkMiddleware + auth.protect) redirects
// anonymous requests to /sign-in before any page renders (F1.1).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <LocaleProvider>
          <ClerkProviderLocalized>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              {children}
            </ThemeProvider>
          </ClerkProviderLocalized>
        </LocaleProvider>
      </body>
    </html>
  );
}
