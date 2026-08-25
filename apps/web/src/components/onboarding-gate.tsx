'use client';

import { useAuth } from '@clerk/nextjs';
import {
  accountsControllerListOptions,
  budgetsControllerListOptions,
} from '@rondo/api-client/react-query';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { onboardingRoute, onboardingState, type OnboardingState } from '@/lib/onboarding';

import type { FetchStatus } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/// Offline is neither an answer nor an error. The query pauses with no data and no failure,
/// so a gate waiting for one of the two waits for something that is not coming.
function unreachable(query: { isError: boolean; fetchStatus: FetchStatus }): boolean {
  return query.isError || query.fetchStatus === 'paused';
}

export function OnboardingGate({
  expects,
  fallback = null,
  children,
}: {
  expects: OnboardingState;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const { t } = useTranslations();
  const { userId } = useAuth();
  const signedIn = userId !== null && userId !== undefined;

  // `isFetchedAfterMount` is what makes these this mount's own answers. A cached one can be
  // older than the budget it is being asked about, and it would send a user who already has
  // one to the screen that creates a second, deactivating the first without asking.
  const budgets = useQuery({ ...budgetsControllerListOptions(), enabled: signedIn });
  const budgetsRead = budgets.isSuccess && budgets.isFetchedAfterMount ? budgets.data : null;
  const hasActiveBudget = budgetsRead?.some((budget) => budget.active) ?? false;

  const accounts = useQuery({
    ...accountsControllerListOptions(),
    enabled: signedIn && hasActiveBudget,
  });
  const accountsRead = accounts.isSuccess && accounts.isFetchedAfterMount ? accounts.data : null;

  // What a verdict belongs to. The subtree outlives both: one layout wraps both steps of
  // setup, and the app shell survives a change of signed-in user. A verdict carried across
  // either would answer for a question nobody asked.
  const guarding = `${userId ?? ''}:${expects}`;
  const [decidedFor, setDecidedFor] = useState(guarding);
  const [verdict, setVerdict] = useState<OnboardingState | null>(null);

  if (decidedFor !== guarding) {
    setDecidedFor(guarding);
    setVerdict(null);
  }

  const answer = verdict ?? onboardingState({ budgets: budgetsRead, accounts: accountsRead });

  // Decided once, and then held. The screens behind this gate create the very budget and
  // account it reads, and they invalidate those queries on success; without the latch the
  // answer arriving a moment later would tear the confirmation off the screen.
  if (verdict === null && answer !== null) {
    setVerdict(answer);
  }

  useEffect(() => {
    if (answer !== null && answer !== expects) {
      router.replace(onboardingRoute(answer));
    }
  }, [answer, expects, router]);

  if (answer === null && (unreachable(budgets) || unreachable(accounts))) {
    return (
      <p role="alert" className="text-destructive p-6 text-sm">
        {t('onboarding.unavailable')}
      </p>
    );
  }

  return answer === expects ? children : fallback;
}
