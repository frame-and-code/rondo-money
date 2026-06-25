import { parseMoney, serializeMoney } from '@ffai/types';

// Covers the @ffai/types money convention (F0.4 DoD: money is bigint, string on the wire).
// Lives here until @ffai/types gets its own test runner with the F0.8 harness.
describe('money serialization', () => {
  it('serializes minor units to a base-10 string', () => {
    expect(serializeMoney(123n)).toBe('123');
    expect(serializeMoney(0n)).toBe('0');
    expect(serializeMoney(-4500n)).toBe('-4500');
  });

  it('parses a string back to a bigint', () => {
    expect(parseMoney('123')).toBe(123n);
    expect(typeof parseMoney('123')).toBe('bigint');
    expect(parseMoney('-4500')).toBe(-4500n);
  });

  it('round-trips values beyond Number.MAX_SAFE_INTEGER without loss', () => {
    const huge = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    expect(parseMoney(serializeMoney(huge))).toBe(huge);
  });

  it('rejects malformed amounts instead of truncating', () => {
    expect(() => parseMoney('12.5')).toThrow(TypeError);
    expect(() => parseMoney('1e3')).toThrow(TypeError);
    expect(() => parseMoney(' 12 ')).toThrow(TypeError);
    expect(() => parseMoney('abc')).toThrow(TypeError);
    expect(() => parseMoney('')).toThrow(TypeError);
  });
});
