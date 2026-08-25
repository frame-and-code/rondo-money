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

/// What this mount is allowed to decide on, and `null` for everything else.
///
/// `isFetchedAfterMount` rules out a cached answer, which can be older than the row it is
/// being asked about. `isFetching` rules out one that is being replaced right now: the screens
/// behind this gate invalidate these queries the moment they write, and the way on to the next
/// step is already on screen while that read is still in flight. Deciding on the answer from
/// before the write sends the user back to the step they have just finished.
function answerOf<T>(query: {
  data: T | undefined;
  isSuccess: boolean;
  isFetchedAfterMount: boolean;
  isFetching: boolean;
}): T | null {
  return query.isSuccess && query.isFetchedAfterMount && !query.isFetching
    ? (query.data ?? null)
    : null;
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

  const budgets = useQuery({ ...budgetsControllerListOptions(), enabled: signedIn });
  const budgetsRead = answerOf(budgets);
  const hasActiveBudget = budgetsRead?.some((budget) => budget.active) ?? false;

  const accounts = useQuery({
    ...accountsControllerListOptions(),
    enabled: signedIn && hasActiveBudget,
  });
  const accountsRead = answerOf(accounts);

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
