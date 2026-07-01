import type { ReactNode } from 'react';

// Route-group stub for the future authenticated app shell (sidebar/topbar + the budget
// screens). The `(app)` group adds no URL segment — it just reserves the place where the
// full navigation skeleton slots in (Phase 3). Kept deliberately empty for F0.5.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div data-app-shell>{children}</div>;
}
