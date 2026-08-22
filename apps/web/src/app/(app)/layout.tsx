import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return <div data-app-shell>{children}</div>;
}
