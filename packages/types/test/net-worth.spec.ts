import { NET_WORTH_REFUSALS, isNetWorthRefusal } from '@rondo/types';

describe('what an asset or a liability operation can be refused for', () => {
  it('names every reason the two endpoints answer with', () => {
    expect([...NET_WORTH_REFUSALS]).toEqual([
      'DATE_IN_FUTURE',
      'NO_ACTIVE_BUDGET',
      'UNKNOWN_ASSET',
      'UNKNOWN_LIABILITY',
    ]);
  });

  it('recognises every reason it lists', () => {
    for (const reason of NET_WORTH_REFUSALS) {
      expect(isNetWorthRefusal(reason)).toBe(true);
    }
  });

  it('refuses anything that is not one of them', () => {
    for (const value of [
      'UNKNOWN_ACCOUNT',
      'unknown_asset',
      '',
      null,
      undefined,
      0,
      ['UNKNOWN_ASSET'],
    ]) {
      expect(isNetWorthRefusal(value)).toBe(false);
    }
  });
});
