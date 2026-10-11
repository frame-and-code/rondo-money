import { admits, onboardingRoute, onboardingState } from '@/lib/onboarding';

const active = { active: true };
const inactive = { active: false };
const holding = { accounts: [{ id: 'account-1' }], total: '1000' };
const nothing = { accounts: [], total: '0' };

describe('where a user stands in setup', () => {
  it('sends a user with no budget at all to step 1', () => {
    expect(onboardingState({ budgets: [], accounts: null })).toBe('budget');
  });

  it('sends a user whose budgets are all inactive to step 1', () => {
    expect(onboardingState({ budgets: [inactive, inactive], accounts: null })).toBe('budget');
  });

  it('sends a user who has a budget but no accounts to step 2', () => {
    expect(onboardingState({ budgets: [active], accounts: nothing })).toBe('account');
  });

  it('lets a user who has both into the app', () => {
    expect(onboardingState({ budgets: [active], accounts: holding })).toBe('app');
  });

  it('has no answer until this mount has read both halves', () => {
    expect(onboardingState({ budgets: null, accounts: null })).toBeNull();
    expect(onboardingState({ budgets: null, accounts: holding })).toBeNull();
    expect(onboardingState({ budgets: [active], accounts: null })).toBeNull();
  });

  it('names the route each state belongs on', () => {
    expect(onboardingRoute('budget')).toBe('/new');
    expect(onboardingRoute('account')).toBe('/new/account');
    expect(onboardingRoute('app')).toBe('/categories');
  });

  it('opens the budget step to a user with no budget and to one who finished setup', () => {
    expect(admits('budget', 'budget')).toBe(true);
    expect(admits('budget', 'app')).toBe(true);
    expect(admits('budget', 'account')).toBe(false);
  });

  it('opens the account step only to a user whose budget has no account yet', () => {
    expect(admits('account', 'account')).toBe(true);
    expect(admits('account', 'budget')).toBe(false);
    expect(admits('account', 'app')).toBe(false);
  });

  it('opens the app only to a user who finished setup', () => {
    expect(admits('app', 'app')).toBe(true);
    expect(admits('app', 'budget')).toBe(false);
    expect(admits('app', 'account')).toBe(false);
  });
});
