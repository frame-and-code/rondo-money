import { TRANSFER_REFUSALS, isTransferRefusal } from '@rondo/types';

describe('the reasons a transfer is refused', () => {
  it('names every refusal the screen has to tell apart', () => {
    expect([...TRANSFER_REFUSALS]).toEqual([
      'ACCOUNT_ARCHIVED',
      'DATE_BEFORE_ACCOUNT',
      'DATE_IN_FUTURE',
      'NO_ACTIVE_BUDGET',
      'SAME_ACCOUNT',
      'UNKNOWN_ACCOUNT',
      'UNKNOWN_TRANSFER',
    ]);
  });

  it('recognises every reason it lists', () => {
    for (const reason of TRANSFER_REFUSALS) {
      expect(isTransferRefusal(reason)).toBe(true);
    }
  });

  it('refuses anything else, so a message is never mistaken for a reason', () => {
    for (const value of [
      'same_account',
      'SameAccount',
      'The two sides name one account',
      '',
      ' SAME_ACCOUNT',
      'UNKNOWN_TRANSACTION',
      null,
      undefined,
      0,
      ['SAME_ACCOUNT'],
    ]) {
      expect(isTransferRefusal(value)).toBe(false);
    }
  });
});
