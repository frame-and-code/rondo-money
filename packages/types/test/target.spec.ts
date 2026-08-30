import { TARGET_KINDS, isTargetKind } from '@rondo/types';

describe('isTargetKind', () => {
  it.each(TARGET_KINDS)('accepts %s, which the column can hold', (kind) => {
    expect(isTargetKind(kind)).toBe(true);
  });

  it('refuses a name the app does not know, whatever its shape', () => {
    expect(isTargetKind('SPEND')).toBe(false);
    expect(isTargetKind('refill_to')).toBe(false);
    expect(isTargetKind('')).toBe(false);
    expect(isTargetKind(null)).toBe(false);
    expect(isTargetKind(undefined)).toBe(false);
    expect(isTargetKind(1)).toBe(false);
  });
});

describe('TARGET_KINDS', () => {
  it('names the four kinds once each', () => {
    expect(TARGET_KINDS).toHaveLength(4);
    expect(new Set(TARGET_KINDS).size).toBe(TARGET_KINDS.length);
  });
});
