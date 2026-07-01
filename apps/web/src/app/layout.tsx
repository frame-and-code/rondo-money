import { ThemeProvider } from '@ffai/ui/components/theme-provider';

import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Fin Flow AI',
  description: 'Zero-based budgeting — application shell (F0.5).',
};

// Root layout for the whole App Router tree. The product is RU-first (PRD is the RU
// source of truth); a real i18n setup lands later — `lang` is hard-coded for now.
// `suppressHydrationWarning` is required by next-themes: it sets the theme class on
// `<html>` via an inline script that runs before hydration, so the class deliberately
// won't match between the SSR markup and the client on first paint.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
