import { accountFailure } from '@/lib/account-failure';

describe('what a refused correction of an opening balance tells the user', () => {
  it('names the reason the domain gave rather than the status it came under', () => {
    expect(accountFailure({ statusCode: 400, reason: 'OPENING_FROZEN' })).toBe(
      'transactions.failOpeningFrozen',
    );
    expect(accountFailure({ statusCode: 400, reason: 'UNKNOWN_ACCOUNT' })).toBe(
      'transactions.failOther',
    );
  });

  it('says what still holds the account open when the archive was refused', () => {
    expect(accountFailure({ statusCode: 400, reason: 'BALANCE_NOT_ZERO' })).toBe(
      'accounts.failBalanceNotZero',
    );
    expect(accountFailure({ statusCode: 400, reason: 'ACCOUNT_ARCHIVED' })).toBe(
      'accounts.failArchived',
    );
  });

  it('says the budget changed under the screen when that is what was reported', () => {
    expect(accountFailure({ statusCode: 400, reason: 'NO_ACTIVE_BUDGET' })).toBe(
      'transactions.failBudget',
    );
  });

  it('falls back on what the answer was when the domain gave no reason', () => {
    expect(accountFailure({ statusCode: 409 })).toBe('transactions.failConflict');
    expect(accountFailure({ statusCode: 500 })).toBe('transactions.failOther');
    expect(accountFailure(new Error('unreachable'))).toBe('transactions.failNetwork');
  });
});
