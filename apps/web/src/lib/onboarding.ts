export type OnboardingState = 'budget' | 'account' | 'app';

/// `null` on either half means "this mount has no answer of its own yet", which is not the
/// same as an empty list. Deciding on the difference is what keeps a stale cache from sending
/// someone who has a budget to the screen that would create them a second one.
export interface OnboardingReads {
  budgets: readonly { active: boolean }[] | null;
  accounts: readonly unknown[] | null;
}

const ROUTES: Record<OnboardingState, string> = {
  budget: '/new',
  account: '/new/account',
  app: '/categories',
};

export function onboardingState({ budgets, accounts }: OnboardingReads): OnboardingState | null {
  if (budgets === null) return null;
  if (!budgets.some((budget) => budget.active)) return 'budget';

  // Read only once there is an active budget to scope it to: the endpoint answers 400
  // without one, so asking earlier buys an error in place of an answer.
  if (accounts === null) return null;

  return accounts.length === 0 ? 'account' : 'app';
}

export function onboardingRoute(state: OnboardingState): string {
  return ROUTES[state];
}
