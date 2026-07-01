import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// No global stylesheet yet: Tailwind's base layer + shadcn/ui theme land in F0.6, and
// that's where `globals.css` (with the @tailwind directives) will be introduced.
export const metadata: Metadata = {
  title: 'Fin Flow AI',
  description: 'Zero-based budgeting — application shell (F0.5).',
};

// Root layout for the whole App Router tree. The product is RU-first (PRD is the RU
// source of truth); a real i18n setup lands later — `lang` is hard-coded for now.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
