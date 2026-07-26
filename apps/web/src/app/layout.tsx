import { ClerkProvider, Show } from '@clerk/nextjs';
import { shadcn } from '@clerk/ui/themes';
import { ThemeProvider } from '@ffai/ui/components/theme-provider';
import './globals.css';
import { Card, CardContent, CardHeader } from '@ffai/ui/components/ui/card';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { SignInButtonLocalized } from '@/components/sign-in-button';
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
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ClerkProvider appearance={{ theme: shadcn }}>
          <LocaleProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              <Show when="signed-in">{children}</Show>
              <Show when="signed-out">
                <div className="mx-auto flex max-w-xl flex-col gap-6 p-8">
                  <Card>
                    <CardHeader>
                      <div className="flex flex-row justify-between">
                        <h1 className="text-2xl font-semibold">Fin Flow AI</h1>
                        <LocaleSwitcher withLabel />
                      </div>
                    </CardHeader>
                    <CardContent className="w-full">
                      <div className="flex flex-col">
                        <SignInButtonLocalized />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </Show>
            </ThemeProvider>
          </LocaleProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
