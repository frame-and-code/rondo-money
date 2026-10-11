'use client';

import { useAuth } from '@clerk/nextjs';
import {
  accountsControllerListOptions,
  accountsControllerListQueryKey,
  budgetsControllerListOptions,
  budgetsControllerListQueryKey,
  userSettingsControllerReadQueryKey,
} from '@rondo/api-client/react-query';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';

import { useTranslations } from '@/i18n/locale-context';
import { admits, onboardingRoute, onboardingState, type OnboardingState } from '@/lib/onboarding';

import type { FetchStatus, QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

export const AdmittedStateContext = createContext<OnboardingState | null>(null);

export function useAdmittedState(): OnboardingState | null {
  return useContext(AdmittedStateContext);
}

export async function readAnotherBudget(queryClient: QueryClient): Promise<void> {
  const cache = queryClient.getQueryCache();
  const ownReads = [budgetsControllerListQueryKey(), accountsControllerListQueryKey()];
  const ofTheUser = [userSettingsControllerReadQueryKey()];
  const kept = new Set(
    [...ownReads, ...ofTheUser].flatMap((queryKey) => cache.findAll({ queryKey })),
  );

  await Promise.all([
    queryClient.resetQueries({ predicate: (query) => !kept.has(query) }),
    ...ownReads.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ]);
}

function unreachable(query: { isError: boolean; fetchStatus: FetchStatus }): boolean {
  return query.isError || query.fetchStatus === 'paused';
}

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

  const guarding = `${userId ?? ''}:${expects}`;
  const [decidedFor, setDecidedFor] = useState(guarding);
  const [verdict, setVerdict] = useState<OnboardingState | null>(null);

  if (decidedFor !== guarding) {
    setDecidedFor(guarding);
    setVerdict(null);
  }

  const answer = verdict ?? onboardingState({ budgets: budgetsRead, accounts: accountsRead });

  if (verdict === null && answer !== null) {
    setVerdict(answer);
  }

  const admitted = answer !== null && admits(expects, answer);

  useEffect(() => {
    if (answer !== null && !admitted) {
      router.replace(onboardingRoute(answer));
    }
  }, [answer, admitted, router]);

  if (answer === null && (unreachable(budgets) || unreachable(accounts))) {
    return (
      <p role="alert" className="text-destructive p-6 text-sm">
        {t('onboarding.unavailable')}
      </p>
    );
  }

  return admitted ? (
    <AdmittedStateContext.Provider value={answer}>{children}</AdmittedStateContext.Provider>
  ) : (
    fallback
  );
}
