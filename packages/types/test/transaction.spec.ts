import {
  TRANSACTION_ENTRY_TYPES,
  TRANSACTION_REFUSALS,
  TRANSACTION_TYPES,
  isTransactionEntryType,
  isTransactionRefusal,
  isTransactionType,
} from '../src/index.js';

describe('the kinds a transaction can be', () => {
  it('holds the four the schema stores', () => {
    expect([...TRANSACTION_TYPES].sort()).toEqual(['ADJUSTMENT', 'EXPENSE', 'INCOME', 'TRANSFER']);
  });

  it('lets a form send only the two a person enters by hand', () => {
    expect([...TRANSACTION_ENTRY_TYPES]).toEqual(['INCOME', 'EXPENSE']);

    for (const type of TRANSACTION_ENTRY_TYPES) {
      expect(isTransactionType(type)).toBe(true);
    }

    expect(isTransactionEntryType('TRANSFER')).toBe(false);
    expect(isTransactionEntryType('ADJUSTMENT')).toBe(false);
  });

  it('recognises its own values and nothing else', () => {
    expect(isTransactionType('INCOME')).toBe(true);
    expect(isTransactionType('income')).toBe(false);
    expect(isTransactionType(undefined)).toBe(false);

    expect(isTransactionEntryType('EXPENSE')).toBe(true);
    expect(isTransactionEntryType(2)).toBe(false);
  });
});

describe('the reasons a transaction is refused', () => {
  it('names every refusal a screen answers differently', () => {
    expect([...TRANSACTION_REFUSALS].sort()).toEqual([
      'ACCOUNT_ARCHIVED',
      'CATEGORY_HIDDEN',
      'CATEGORY_REQUIRED',
      'DATE_BEFORE_ACCOUNT',
      'DATE_IN_FUTURE',
      'NOT_EDITABLE',
      'NO_ACTIVE_BUDGET',
      'UNKNOWN_ACCOUNT',
      'UNKNOWN_CATEGORY',
      'UNKNOWN_TRANSACTION',
    ]);
  });

  it('recognises a refusal it carries and nothing else', () => {
    expect(isTransactionRefusal('CATEGORY_HIDDEN')).toBe(true);
    expect(isTransactionRefusal('SOMETHING_ELSE')).toBe(false);
    expect(isTransactionRefusal(null)).toBe(false);
  });
});
