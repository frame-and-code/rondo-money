'use client';

import { usePathname } from 'next/navigation';

import { OnboardingGate } from '@/components/onboarding-gate';
import { OnboardingLoading } from '@/components/onboarding-loading';
import { stepAt } from '@/lib/onboarding';

import type { ReactNode } from 'react';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const expects = stepAt(pathname);

  return (
    <OnboardingGate expects={expects} fallback={<OnboardingLoading />}>
      {children}
    </OnboardingGate>
  );
}
