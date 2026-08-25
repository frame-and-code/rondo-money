'use client';

import { usePathname } from 'next/navigation';

import { OnboardingGate } from '@/components/onboarding-gate';
import { OnboardingLoading } from '@/components/onboarding-loading';
import { onboardingRoute } from '@/lib/onboarding';

import type { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const expects = pathname === onboardingRoute('account') ? 'account' : 'budget';

  return (
    <OnboardingGate expects={expects} fallback={<OnboardingLoading />}>
      {children}
    </OnboardingGate>
  );
}
