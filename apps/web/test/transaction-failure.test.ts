import { transactionFailure } from '@/lib/transaction-failure';

describe('telling a person why a record was refused', () => {
  it('answers each refusal with its own words', () => {
    expect(transactionFailure({ statusCode: 400, reason: 'DATE_IN_FUTURE' })).toBe(
      'transactions.failFuture',
    );
    expect(transactionFailure({ statusCode: 400, reason: 'DATE_BEFORE_ACCOUNT' })).toBe(
      'transactions.failBeforeAccount',
    );
    expect(transactionFailure({ statusCode: 400, reason: 'CATEGORY_REQUIRED' })).toBe(
      'transactions.failCategoryRequired',
    );
    expect(transactionFailure({ statusCode: 400, reason: 'CATEGORY_HIDDEN' })).toBe(
      'transactions.failCategoryHidden',
    );
    expect(transactionFailure({ statusCode: 400, reason: 'ACCOUNT_ARCHIVED' })).toBe(
      'transactions.failAccountArchived',
    );
    expect(transactionFailure({ statusCode: 400, reason: 'NOT_EDITABLE' })).toBe(
      'transactions.failNotEditable',
    );
  });

  it('falls back to one message when the reason is not one it knows', () => {
    expect(transactionFailure({ statusCode: 400, reason: 'SOMETHING_ELSE' })).toBe(
      'transactions.failOther',
    );
    expect(transactionFailure({ statusCode: 500 })).toBe('transactions.failOther');
  });

  it('says the record may already be written when the key was claimed', () => {
    expect(transactionFailure({ statusCode: 409 })).toBe('transactions.failConflict');
  });

  it('says the request never arrived when there is no answer at all', () => {
    expect(transactionFailure(new Error('offline'))).toBe('transactions.failNetwork');
  });
});
