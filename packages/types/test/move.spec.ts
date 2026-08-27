import { MOVE_REFUSALS, MOVE_SIDE_KINDS, isMoveRefusal, isMoveSideKind } from '@rondo/types';

describe('the sides a move has', () => {
  it('holds the two kinds of envelope money can sit in', () => {
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

describe('the reasons a move is refused', () => {
  it('names every refusal the screen has to tell apart', () => {
    expect([...MOVE_REFUSALS]).toEqual([
      'CATEGORY_HIDDEN',
      'NO_ACTIVE_BUDGET',
      'UNKNOWN_CATEGORY',
      'SAME_ENVELOPE',
    ]);
  });

  it('recognises every reason it lists', () => {
    for (const reason of MOVE_REFUSALS) {
      expect(isMoveRefusal(reason)).toBe(true);
    }
  });

  it('refuses anything else, so a message is never mistaken for a reason', () => {
    for (const value of [
      'category_hidden',
      'CategoryHidden',
      'Category is hidden',
      '',
      null,
      undefined,
      0,
      ['CATEGORY_HIDDEN'],
    ]) {
      expect(isMoveRefusal(value)).toBe(false);
    }
  });
});
