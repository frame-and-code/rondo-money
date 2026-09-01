import { ACCOUNT_REFUSALS, ACCOUNT_TYPES, isAccountRefusal, isAccountType } from '@rondo/types';

describe('account types', () => {
  it('holds the two kinds an account row can be created with', () => {
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

describe('what an account operation can be refused for', () => {
  it('names every reason the accounts endpoints answer with', () => {
    expect([...ACCOUNT_REFUSALS]).toEqual([
      'ACCOUNT_ARCHIVED',
      'BALANCE_NOT_ZERO',
      'NO_ACTIVE_BUDGET',
      'OPENING_FROZEN',
      'UNKNOWN_ACCOUNT',
    ]);
  });

  it('recognises every reason it lists', () => {
    for (const reason of ACCOUNT_REFUSALS) {
      expect(isAccountRefusal(reason)).toBe(true);
    }
  });

  it('refuses anything that is not one of them', () => {
    for (const value of [
      'NOT_EDITABLE',
      'opening_frozen',
      '',
      null,
      undefined,
      0,
      ['OPENING_FROZEN'],
    ]) {
      expect(isAccountRefusal(value)).toBe(false);
    }
  });
});
