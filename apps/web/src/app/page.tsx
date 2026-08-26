import { redirect } from 'next/navigation';

import { onboardingRoute } from '@/lib/onboarding';

export default function RootPage(): never {
  redirect(onboardingRoute('app'));
}
