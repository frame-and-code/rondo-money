import { redirect } from 'next/navigation';

import { onboardingRoute } from '@/lib/onboarding';

/// The one address a person types by hand. It carries them into the app, where the gate reads
/// how far their setup got and sends them to the step they are actually on.
export default function RootPage(): never {
  redirect(onboardingRoute('app'));
}
