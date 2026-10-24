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

export const BALANCES_ROUTE = '/new/balances';

export function stepAt(pathname: string): OnboardingState {
  if (pathname === BALANCES_ROUTE) return 'app';

  return pathname === ROUTES.account ? 'account' : 'budget';
}

export function onboardingRoute(state: OnboardingState): string {
  return ROUTES[state];
}

const ADMITTED: Record<OnboardingState, readonly OnboardingState[]> = {
  budget: ['budget', 'app'],
  account: ['account'],
  app: ['app'],
};

export function admits(step: OnboardingState, state: OnboardingState): boolean {
  return ADMITTED[step].includes(state);
}
