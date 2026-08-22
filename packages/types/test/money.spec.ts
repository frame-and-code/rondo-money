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
    expect(parseDecimalString('12.5', 'USD')).toBe(1250n);
    expect(parseDecimalString('12', 'USD')).toBe(1200n);
    expect(parseDecimalString('1.2', 'BHD')).toBe(1200n);
    expect(parseDecimalString('0', 'USD')).toBe(0n);
    expect(parseDecimalString('-0.00', 'USD')).toBe(0n);
  });

  it('refuses more precision than the currency has instead of rounding it away', () => {
    expect(() => parseDecimalString('12.555', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalString('12.5', 'JPY')).toThrow(TypeError);
    expect(() => parseDecimalString('12.0', 'JPY')).toThrow(TypeError);
    expect(() => parseDecimalString('1.23456', 'CLF')).toThrow(TypeError);
  });

  it('refuses extra precision even when it is only trailing zeros', () => {
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
    const huge = 9_007_199_254_740_993n;
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
