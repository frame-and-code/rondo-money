import { MOVE_SIDE_KINDS, isMoveSideKind } from '@rondo/types';

describe('the sides a move has', () => {
  it('holds the two kinds of envelope money can sit in', () => {
    // A pin rather than a restatement: a third kind here is a third envelope, and every
    // number on the budget screen is computed from these two alone.
    expect([...MOVE_SIDE_KINDS]).toEqual(['CATEGORY', 'READY_TO_ASSIGN']);
  });

  it('recognises every kind it lists', () => {
    for (const kind of MOVE_SIDE_KINDS) {
      expect(isMoveSideKind(kind)).toBe(true);
    }
  });

  it('refuses a kind the app does not hold, whatever it looks like', () => {
    for (const value of [
      'RTA',
      'category',
      'Category',
      'READY-TO-ASSIGN',
      '',
      ' CATEGORY',
      null,
      undefined,
      0,
      ['CATEGORY'],
    ]) {
      expect(isMoveSideKind(value)).toBe(false);
    }
  });
});
