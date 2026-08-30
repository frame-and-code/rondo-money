export type OnboardingState = 'budget' | 'account' | 'app';

export interface OnboardingReads {
  budgets: readonly { active: boolean }[] | null;
  accounts: { accounts: readonly unknown[] } | null;
}

const ROUTES: Record<OnboardingState, string> = {
  budget: '/new',
  account: '/new/account',
  app: '/categories',
};

export function onboardingState({ budgets, accounts }: OnboardingReads): OnboardingState | null {
  if (budgets === null) return null;
  if (!budgets.some((budget) => budget.active)) return 'budget';

  if (accounts === null) return null;

  return accounts.accounts.length === 0 ? 'account' : 'app';
}

export function onboardingRoute(state: OnboardingState): string {
  return ROUTES[state];
}
