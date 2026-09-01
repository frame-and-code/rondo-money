import { TRANSFER_REFUSALS } from '@rondo/types';

import { transferFailure } from '@/lib/transfer-failure';

const GENERIC: string = 'transactions.failOther';

describe('what the screen says about a refused transfer', () => {
  it('gives every reason the API names its own words', () => {
    const said = TRANSFER_REFUSALS.map((reason) => transferFailure({ reason }));

    expect(said).not.toContain(GENERIC);
    expect(new Set(said).size).toBe(said.length);
  });

  it('names the two accounts rule rather than a generic failure', () => {
    expect(transferFailure({ reason: 'SAME_ACCOUNT' })).toBe('transactions.failSameAccount');
    expect(transferFailure({ reason: 'UNKNOWN_TRANSFER' })).toBe('transactions.failTransferGone');
    expect(transferFailure({ reason: 'DATE_BEFORE_ACCOUNT' })).toBe(
      'transactions.failBeforeAccountTransfer',
    );
  });

  it('falls back to what kind of failure it was when the answer names no reason', () => {
    expect(transferFailure(new TypeError('Failed to fetch'))).toBe('transactions.failNetwork');
    expect(transferFailure({ statusCode: 400, reason: 'CATEGORY_HIDDEN' })).toBe(GENERIC);
  });
});
