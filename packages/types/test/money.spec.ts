import fc from 'fast-check';

import {
  MONEY_MAX,
  MONEY_MAX_LENGTH,
  MONEY_MIN,
  MONEY_PATTERN,
  isStorableMoney,
  minorDigits,
  parseDecimalString,
  parseMoney,
  serializeMoney,
  toDecimalString,
} from '@rondo/types';

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

  it('accepts only the canonical form, so one amount has exactly one spelling', () => {
    // `serializeMoney` never emits a leading zero or a negative zero, and this is the parser
    // for what it emits. Accepting the variants would give a single amount several wire forms
    // — which is what makes a length bound unable to imply a range bound, and what lets two
    // requests carrying "the same" amount differ byte for byte.
    expect(() => parseMoney('007')).toThrow(TypeError);
    expect(() => parseMoney('-007')).toThrow(TypeError);
    expect(() => parseMoney('00')).toThrow(TypeError);
    expect(() => parseMoney('-0')).toThrow(TypeError);
    expect(parseMoney('0')).toBe(0n);
    expect(parseMoney('-5')).toBe(-5n);
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
        // Asserted through MONEY_PATTERN itself rather than a copy of it: a copy would keep
        // passing if the two drifted, and this property is what the API's length-implies-range
        // shortcut rests on.
        expect(MONEY_PATTERN.test(serializeMoney(amount))).toBe(true);
      }),
    );
  });

  it('rejects any string that is not the canonical form', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/^(0|-?[1-9]\d*)$/.test(s)),
        (garbage) => {
          expect(() => parseMoney(garbage)).toThrow(TypeError);
        },
      ),
    );
  });
});

// Minor units ↔ the decimal form a human reads and types. Deliberately not
// locale-aware: no symbol, no grouping separators, no locale-specific decimal mark. Rendering
// an amount for a screen belongs to the UI, which composes `Intl.NumberFormat` on the digit count
// this layer owns.
describe('decimal conversion', () => {
  it('places the decimal mark by the currency, not by a fixed two digits', () => {
    expect(toDecimalString(1250n, 'USD')).toBe('12.50');
    expect(toDecimalString(1250n, 'JPY')).toBe('1250');
    expect(toDecimalString(1250n, 'BHD')).toBe('1.250');
    expect(toDecimalString(12345n, 'CLF')).toBe('1.2345');
  });

  it('pads an amount smaller than one whole unit', () => {
    expect(toDecimalString(5n, 'USD')).toBe('0.05');
    expect(toDecimalString(0n, 'USD')).toBe('0.00');
    expect(toDecimalString(0n, 'JPY')).toBe('0');
    expect(toDecimalString(1n, 'BHD')).toBe('0.001');
  });

  it('keeps the sign in front of the whole amount, not of its fractional part', () => {
    expect(toDecimalString(-5n, 'USD')).toBe('-0.05');
    expect(toDecimalString(-1250n, 'USD')).toBe('-12.50');
    expect(toDecimalString(-1250n, 'JPY')).toBe('-1250');
  });

  it('reads a decimal string back into minor units', () => {
    expect(parseDecimalString('12.50', 'USD')).toBe(1250n);
    expect(parseDecimalString('-0.05', 'USD')).toBe(-5n);
    expect(parseDecimalString('1250', 'JPY')).toBe(1250n);
    expect(parseDecimalString('1.2345', 'CLF')).toBe(12345n);
  });

  it('accepts fewer fractional digits than the currency has, and pads them', () => {
    // What a person actually types: `12.5` for twelve fifty, `12` for twelve even.
    expect(parseDecimalString('12.5', 'USD')).toBe(1250n);
    expect(parseDecimalString('12', 'USD')).toBe(1200n);
    expect(parseDecimalString('1.2', 'BHD')).toBe(1200n);
    expect(parseDecimalString('0', 'USD')).toBe(0n);
    expect(parseDecimalString('-0.00', 'USD')).toBe(0n);
  });

  it('refuses more precision than the currency has instead of rounding it away', () => {
    // The money the user typed and the money we would store must be the same number. Rounding
    // here is the silent-truncation failure `parseMoney` already refuses to commit.
    expect(() => parseDecimalString('12.555', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('12.5', 'JPY')).toThrow(TypeError);
    expect(() => parseDecimalString('12.0', 'JPY')).toThrow(TypeError);
    expect(() => parseDecimalString('1.23456', 'CLF')).toThrow(TypeError);
  });

  it('refuses extra precision even when it is only trailing zeros', () => {
    // Nothing would be lost reading "12.500" as twelve fifty, and it is still refused: more
    // digits than the currency defines is likelier a currency mixed up than a deliberate zero,
    // and deciding case by case which extra digits are safe to drop is how rounding creeps in.
    expect(() => parseDecimalString('12.500', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('12.00', 'JPY')).toThrow(TypeError);
  });

  it('refuses shapes that are not a plain signed decimal', () => {
    expect(() => parseDecimalString('', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('.5', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('12.', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('+12.50', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString(' 12.50 ', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('1e3', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('12.5.5', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('--5', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('abc', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('1,250.00', 'USD')).toThrow(TypeError);
  });

  it('names the offending input, so the failure is actionable', () => {
    expect(() => parseDecimalString('12.555', 'USD')).toThrow(/12\.555/);
  });

  it('carries a malformed currency through both directions', () => {
    expect(() => toDecimalString(1250n, 'usd')).toThrow(TypeError);
    expect(() => parseDecimalString('12.50', 'usd')).toThrow(TypeError);
  });

  it('survives amounts beyond Number.MAX_SAFE_INTEGER', () => {
    // The whole reason money is bigint: this is where a float silently loses the last digits.
    const huge = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    expect(toDecimalString(huge, 'USD')).toBe('90071992547409.93');
    expect(parseDecimalString('90071992547409.93', 'USD')).toBe(huge);
  });
});

describe('decimal conversion (properties)', () => {
  const CURRENCIES = ['JPY', 'USD', 'BHD', 'CLF'];

  it('parse ∘ toDecimalString is the identity for any amount in any currency', () => {
    fc.assert(
      fc.property(fc.bigInt(), fc.constantFrom(...CURRENCIES), (amount, currency) => {
        expect(parseDecimalString(toDecimalString(amount, currency), currency)).toBe(amount);
      }),
    );
  });

  it('never emits a decimal mark for a currency with no minor unit', () => {
    fc.assert(
      fc.property(fc.bigInt(), (amount) => {
        expect(toDecimalString(amount, 'JPY')).not.toContain('.');
      }),
    );
  });

  it('emits exactly as many fractional digits as the currency has', () => {
    fc.assert(
      fc.property(fc.bigInt(), fc.constantFrom('USD', 'BHD', 'CLF'), (amount, currency) => {
        const fraction = toDecimalString(amount, currency).split('.')[1];
        expect(fraction).toHaveLength(minorDigits(currency));
      }),
    );
  });
});

// The pattern is exported so the validator and the OpenAPI `pattern` can share one definition
// with the parser. These two tests are what makes that sharing safe: if the pattern and
// `parseMoney` ever disagree, the contract would advertise a shape the API then refuses.
describe('MONEY_PATTERN', () => {
  it('accepts exactly what parseMoney accepts, and rejects exactly what it rejects', () => {
    fc.assert(
      fc.property(fc.string(), (candidate) => {
        if (MONEY_PATTERN.test(candidate)) {
          expect(() => parseMoney(candidate)).not.toThrow();
        } else {
          expect(() => parseMoney(candidate)).toThrow(TypeError);
        }
      }),
    );
  });

  it('carries no flags, so repeated tests cannot go stateful on lastIndex', () => {
    // A `g` flag here would make every second call against the same string return false —
    // a validator that passes on retry is worse than one that never passes.
    expect(MONEY_PATTERN.flags).toBe('');
    expect(MONEY_PATTERN.source).toBe(String.raw`^(0|-?[1-9]\d*)$`);
  });

  it('makes the length bound imply the range bound, which is what lets the API use it', () => {
    // With one spelling per amount, a string longer than MONEY_MAX_LENGTH cannot be in range —
    // so the API may refuse on length before parsing and still report the truthful reason.
    // With leading zeros allowed this was false: "-09223372036854775808" is 21 characters and
    // exactly MONEY_MIN.
    for (const digits of [MONEY_MAX_LENGTH + 1, MONEY_MAX_LENGTH + 5]) {
      const positive = '9'.repeat(digits);
      const negative = `-${'9'.repeat(digits - 1)}`;

      expect(MONEY_PATTERN.test(positive) && isStorableMoney(parseMoney(positive))).toBe(false);
      expect(MONEY_PATTERN.test(negative) && isStorableMoney(parseMoney(negative))).toBe(false);
    }
  });
});

// Money has a ceiling because the column it lands in does: a signed 64-bit integer. `bigint`
// itself is unbounded, so without this an amount can pass every shape check and only fail as a
// driver error at the very end of a write, where the user is told nothing useful.
describe('storable range', () => {
  it('spans the signed 64-bit integer, which is what the column holds', () => {
    expect(MONEY_MAX).toBe(9223372036854775807n);
    expect(MONEY_MIN).toBe(-9223372036854775808n);
  });

  it('accepts both ends and everything ordinary between them', () => {
    expect(isStorableMoney(MONEY_MAX)).toBe(true);
    expect(isStorableMoney(MONEY_MIN)).toBe(true);
    expect(isStorableMoney(0n)).toBe(true);
    expect(isStorableMoney(-4500n)).toBe(true);
  });

  it('rejects the first value past each end', () => {
    expect(isStorableMoney(MONEY_MAX + 1n)).toBe(false);
    expect(isStorableMoney(MONEY_MIN - 1n)).toBe(false);
  });

  it('states a length that really is the longest a storable amount can be', () => {
    // The length bound exists so a validator can refuse an absurd string before parsing it.
    // That shortcut is only sound while the number matches the range: too small and a legal
    // amount is refused, too large and the shortcut stops being one.
    expect(serializeMoney(MONEY_MIN)).toHaveLength(MONEY_MAX_LENGTH);
    expect(serializeMoney(MONEY_MAX).length).toBeLessThanOrEqual(MONEY_MAX_LENGTH);
  });
});
