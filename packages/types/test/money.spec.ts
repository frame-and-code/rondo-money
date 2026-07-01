import { parseMoney, serializeMoney } from '@ffai/types';
import fc from 'fast-check';

// Covers the money convention (money is bigint minor units, string on the wire).
// Moved from apps/api with the F0.8 harness — domain logic is tested where it lives.
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

// Property-based layer (fast-check) — the runner invariant 5.5 (RTA + Σ Available =
// Σ Balance) will use from Phase 4. Until then it guards the money convention itself:
// serialize/parse must be a lossless bijection over the full bigint range.
describe('money serialization (properties)', () => {
  it('parse ∘ serialize is the identity for any bigint amount', () => {
    fc.assert(
      fc.property(fc.bigInt(), (amount) => {
        expect(parseMoney(serializeMoney(amount))).toBe(amount);
      }),
    );
  });

  it('serialized form is always the canonical base-10 shape parseMoney accepts', () => {
    fc.assert(
      fc.property(fc.bigInt(), (amount) => {
        expect(serializeMoney(amount)).toMatch(/^-?\d+$/);
      }),
    );
  });

  it('rejects any string that is not an optional minus followed by digits', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/^-?\d+$/.test(s)),
        (garbage) => {
          expect(() => parseMoney(garbage)).toThrow(TypeError);
        },
      ),
    );
  });
});
