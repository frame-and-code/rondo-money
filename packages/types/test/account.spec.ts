import { ACCOUNT_TYPES, isAccountType } from '@rondo/types';

describe('account types', () => {
  it('holds the two kinds an account row can be created with', () => {
    // A pin rather than a restatement: adding a kind here without the Ready to Assign work a
    // credit account needs is the mistake this list exists to make visible.
    expect([...ACCOUNT_TYPES]).toEqual(['CASH', 'DEBIT']);
  });

  it('recognises every kind it lists', () => {
    for (const type of ACCOUNT_TYPES) {
      expect(isAccountType(type)).toBe(true);
    }
  });

  it('refuses a kind the app does not hold, whatever it looks like', () => {
    for (const value of ['CREDIT', 'cash', 'Cash', '', ' CASH', null, undefined, 0, ['CASH']]) {
      expect(isAccountType(value)).toBe(false);
    }
  });
});
