import { onboardingRoute, onboardingState } from '@/lib/onboarding';

const active = { active: true };
const inactive = { active: false };
const anAccount = { id: 'account-1' };

describe('where a user stands in setup', () => {
  it('sends a user with no budget at all to step 1', () => {
    expect(onboardingState({ budgets: [], accounts: null })).toBe('budget');
  });

  it('sends a user whose budgets are all inactive to step 1', () => {
    // Unreachable through the API: creating a budget deactivates the previous one and the
    // schema holds at most one active. The branch exists so that a reader with no active
    // budget is never treated as if they had one.
    expect(onboardingState({ budgets: [inactive, inactive], accounts: null })).toBe('budget');
  });

  it('sends a user who has a budget but no accounts to step 2', () => {
    expect(onboardingState({ budgets: [active], accounts: [] })).toBe('account');
  });

  it('lets a user who has both into the app', () => {
    expect(onboardingState({ budgets: [active], accounts: [anAccount] })).toBe('app');
  });

  it('has no answer until this mount has read both halves', () => {
    expect(onboardingState({ budgets: null, accounts: null })).toBeNull();
    expect(onboardingState({ budgets: null, accounts: [anAccount] })).toBeNull();
    expect(onboardingState({ budgets: [active], accounts: null })).toBeNull();
  });

  it('names the route each state belongs on', () => {
    expect(onboardingRoute('budget')).toBe('/new');
    expect(onboardingRoute('account')).toBe('/new/account');
    expect(onboardingRoute('app')).toBe('/categories');
  });
});
