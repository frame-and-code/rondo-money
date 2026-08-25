import { AppShell } from '@/components/app-shell';
import { OnboardingGate } from '@/components/onboarding-gate';
import { ShellLoading } from '@/components/shell-loading';

import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingGate expects="app" fallback={<ShellLoading />}>
      <AppShell>{children}</AppShell>
    </OnboardingGate>
  );
}
