import { CATEGORY_REFUSALS, isCategoryRefusal } from '@rondo/types';

describe('the reasons a change to a category is refused', () => {
  it('names every refusal the screen has to tell apart', () => {
    expect([...CATEGORY_REFUSALS]).toEqual([
      'ALREADY_HIDDEN',
      'AVAILABLE_NOT_ZERO',
      'CATEGORY_HIDDEN',
      'DUE_MONTH_PAST',
      'GROUP_HIDDEN',
      'NO_ACTIVE_BUDGET',
      'NO_TARGET',
      'UNKNOWN_CATEGORY',
      'UNKNOWN_GROUP',
    ]);
  });

  it('recognises every reason it lists', () => {
    for (const reason of CATEGORY_REFUSALS) {
      expect(isCategoryRefusal(reason)).toBe(true);
    }
  });

  it('refuses anything else, so a message is never mistaken for a reason', () => {
    for (const value of [
      'available_not_zero',
      'AvailableNotZero',
      'Available is not zero',
      '',
      null,
      undefined,
      0,
      ['AVAILABLE_NOT_ZERO'],
    ]) {
      expect(isCategoryRefusal(value)).toBe(false);
    }
  });
});
