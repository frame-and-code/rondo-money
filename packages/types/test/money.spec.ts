import {
  MONEY_MAX,
  MONEY_MAX_LENGTH,
  MONEY_MIN,
  MONEY_NON_NEGATIVE_PATTERN,
  MONEY_PATTERN,
  isStorableMoney,
  parseDecimalString,
  parseMoney,
  serializeMoney,
  toDecimalString,
} from '@rondo/types';
import fc from 'fast-check';

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
    const huge = 9_007_199_254_740_993n;
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
    expect(() => parseMoney('007')).toThrow(TypeError);
    expect(() => parseMoney('-007')).toThrow(TypeError);
    expect(() => parseMoney('00')).toThrow(TypeError);
    expect(() => parseMoney('-0')).toThrow(TypeError);
    expect(parseMoney('0')).toBe(0n);
    expect(parseMoney('-5')).toBe(-5n);
  });
});

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

describe('decimal conversion', () => {
  it('places the decimal mark by the digit count it is given, not by a fixed two', () => {
    expect(toDecimalString(1250n, 2)).toBe('12.50');
    expect(toDecimalString(1250n, 0)).toBe('1250');
    expect(toDecimalString(1250n, 3)).toBe('1.250');
    expect(toDecimalString(12345n, 4)).toBe('1.2345');
  });

  it('pads an amount smaller than one whole unit', () => {
    expect(toDecimalString(5n, 2)).toBe('0.05');
    expect(toDecimalString(0n, 2)).toBe('0.00');
    expect(toDecimalString(0n, 0)).toBe('0');
    expect(toDecimalString(1n, 3)).toBe('0.001');
  });

  it('keeps the sign in front of the whole amount, not of its fractional part', () => {
    expect(toDecimalString(-5n, 2)).toBe('-0.05');
    expect(toDecimalString(-1250n, 2)).toBe('-12.50');
    expect(toDecimalString(-1250n, 0)).toBe('-1250');
  });

  it('reads a decimal string back into minor units', () => {
    expect(parseDecimalString('12.50', 2)).toBe(1250n);
    expect(parseDecimalString('-0.05', 2)).toBe(-5n);
    expect(parseDecimalString('1250', 0)).toBe(1250n);
    expect(parseDecimalString('1.2345', 4)).toBe(12345n);
  });

  it('accepts fewer fractional digits than asked for, and pads them', () => {
    expect(parseDecimalString('12.5', 2)).toBe(1250n);
    expect(parseDecimalString('12', 2)).toBe(1200n);
    expect(parseDecimalString('1.2', 3)).toBe(1200n);
    expect(parseDecimalString('0', 2)).toBe(0n);
    expect(parseDecimalString('-0.00', 2)).toBe(0n);
  });

  it('refuses more precision than the digit count allows instead of rounding it away', () => {
    expect(() => parseDecimalString('12.555', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('12.5', 0)).toThrow(TypeError);
    expect(() => parseDecimalString('12.0', 0)).toThrow(TypeError);
    expect(() => parseDecimalString('1.23456', 4)).toThrow(TypeError);
  });

  it('refuses extra precision even when it is only trailing zeros', () => {
    expect(() => parseDecimalString('12.500', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('12.00', 0)).toThrow(TypeError);
  });

  it('refuses shapes that are not a plain signed decimal', () => {
    expect(() => parseDecimalString('', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('.5', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('12.', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('+12.50', 2)).toThrow(TypeError);
    expect(() => parseDecimalString(' 12.50 ', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('1e3', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('12.5.5', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('--5', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('abc', 2)).toThrow(TypeError);
    expect(() => parseDecimalString('1,250.00', 2)).toThrow(TypeError);
  });

  it('names the offending input, so the failure is actionable', () => {
    expect(() => parseDecimalString('12.555', 2)).toThrow(/12\.555/);
  });

  it('refuses a digit count no currency could carry, in both directions', () => {
    expect(() => toDecimalString(1250n, -1)).toThrow(TypeError);
    expect(() => toDecimalString(1250n, 1.5)).toThrow(TypeError);
    expect(() => parseDecimalString('12.50', -1)).toThrow(TypeError);
    expect(() => parseDecimalString('12.50', 1.5)).toThrow(TypeError);
  });

  it('survives amounts beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = 9_007_199_254_740_993n;
    expect(toDecimalString(huge, 2)).toBe('90071992547409.93');
    expect(parseDecimalString('90071992547409.93', 2)).toBe(huge);
  });
});

describe('decimal conversion (properties)', () => {
  const DIGITS = [0, 2, 3, 4];

  it('parse ∘ toDecimalString is the identity at any digit count', () => {
    fc.assert(
      fc.property(fc.bigInt(), fc.constantFrom(...DIGITS), (amount, digits) => {
        expect(parseDecimalString(toDecimalString(amount, digits), digits)).toBe(amount);
      }),
    );
  });

  it('never emits a decimal mark at zero digits', () => {
    fc.assert(
      fc.property(fc.bigInt(), (amount) => {
        expect(toDecimalString(amount, 0)).not.toContain('.');
      }),
    );
  });

  it('emits exactly as many fractional digits as it was asked for', () => {
    fc.assert(
      fc.property(fc.bigInt(), fc.constantFrom(2, 3, 4), (amount, digits) => {
        const fraction = toDecimalString(amount, digits).split('.')[1];
        expect(fraction).toHaveLength(digits);
      }),
    );
  });
});

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
    expect(MONEY_PATTERN.flags).toBe('');
    expect(MONEY_PATTERN.source).toBe(String.raw`^(0|-?[1-9]\d*)$`);
  });

  it('makes the length bound imply the range bound, which is what lets the API use it', () => {
    for (const digits of [MONEY_MAX_LENGTH + 1, MONEY_MAX_LENGTH + 5]) {
      const positive = '9'.repeat(digits);
      const negative = `-${'9'.repeat(digits - 1)}`;

      expect(MONEY_PATTERN.test(positive) && isStorableMoney(parseMoney(positive))).toBe(false);
      expect(MONEY_PATTERN.test(negative) && isStorableMoney(parseMoney(negative))).toBe(false);
    }
  });
});

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
    expect(serializeMoney(MONEY_MIN)).toHaveLength(MONEY_MAX_LENGTH);
    expect(serializeMoney(MONEY_MAX).length).toBeLessThanOrEqual(MONEY_MAX_LENGTH);
  });
});

describe('MONEY_NON_NEGATIVE_PATTERN', () => {
  it('accepts zero and any positive canonical amount', () => {
    expect(MONEY_NON_NEGATIVE_PATTERN.test('0')).toBe(true);
    expect(MONEY_NON_NEGATIVE_PATTERN.test('1250')).toBe(true);
    expect(MONEY_NON_NEGATIVE_PATTERN.test(serializeMoney(MONEY_MAX))).toBe(true);
  });

  it('rejects a negative amount, which is what the account boundary needs', () => {
    expect(MONEY_NON_NEGATIVE_PATTERN.test('-1')).toBe(false);
    expect(MONEY_NON_NEGATIVE_PATTERN.test('-0')).toBe(false);
    expect(MONEY_NON_NEGATIVE_PATTERN.test(serializeMoney(MONEY_MIN))).toBe(false);
  });

  it('rejects the near-misses MONEY_PATTERN also rejects', () => {
    for (const input of ['', ' 1', '1 ', '01', '+1', '1.0', '1e3', 'abc']) {
      expect(MONEY_NON_NEGATIVE_PATTERN.test(input)).toBe(false);
    }
  });

  it('accepts exactly the non-negative half of what MONEY_PATTERN accepts', () => {
    fc.assert(
      fc.property(fc.bigInt(), (amount) => {
        expect(MONEY_NON_NEGATIVE_PATTERN.test(serializeMoney(amount))).toBe(amount >= 0n);
      }),
    );
  });

  it('carries no flags, so repeated tests cannot go stateful on lastIndex', () => {
    expect(MONEY_NON_NEGATIVE_PATTERN.flags).toBe('');
  });
});
