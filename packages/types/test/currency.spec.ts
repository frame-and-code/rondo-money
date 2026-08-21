import { isCurrencyCode, minorDigits } from '@rondo/types';

// The number of minor digits is a property of the currency, never a hardcoded 2 — see
// `.claude/rules/architecture.md`. These cases are the ones that break a hardcoded 2: a
// currency with no minor unit, and the three- and four-digit outliers.
/**
 * The sixteen currencies where the digit count we use differs from the ISO 4217 exponent,
 * with the value each side gives. Every one is a currency whose minor unit has fallen out of
 * circulation — the Hungarian fillér was withdrawn in 1999 — so ICU reports what people
 * actually use and ISO reports what the standard still defines.
 *
 * Pinned because this number decides the scale money is *stored* at, and it comes from the
 * ICU data bundled with the runtime. A Node upgrade that changes one of these entries would
 * silently reinterpret every stored amount in that currency; this test turns that into a
 * failing build instead.
 */
const DIVERGES_FROM_ISO_4217: ReadonlyArray<readonly [string, number, number]> = [
  ['AFN', 0, 2],
  ['ALL', 0, 2],
  ['COP', 0, 2],
  ['HUF', 0, 2],
  ['IDR', 0, 2],
  ['IQD', 0, 3],
  ['IRR', 0, 2],
  ['KPW', 0, 2],
  ['LAK', 0, 2],
  ['LBP', 0, 2],
  ['MGA', 0, 2],
  ['MMK', 0, 2],
  ['PKR', 0, 2],
  ['SOS', 0, 2],
  ['SYP', 0, 2],
  ['YER', 0, 2],
];

describe('minorDigits', () => {
  it('reads the digit count from the currency rather than assuming two', () => {
    expect(minorDigits('JPY')).toBe(0);
    expect(minorDigits('USD')).toBe(2);
    expect(minorDigits('EUR')).toBe(2);
    expect(minorDigits('BHD')).toBe(3);
    expect(minorDigits('KWD')).toBe(3);
    expect(minorDigits('CLF')).toBe(4);
  });

  it('rejects anything that is not a three-letter uppercase code', () => {
    // Lower case is refused rather than normalised: a code reaches us from a database column
    // or a request body, and quietly accepting both spellings is how two of them end up
    // stored. `US` and `USDD` are the shapes a typo actually takes.
    expect(() => minorDigits('usd')).toThrow(TypeError);
    expect(() => minorDigits('US')).toThrow(TypeError);
    expect(() => minorDigits('USDD')).toThrow(TypeError);
    expect(() => minorDigits('U5D')).toThrow(TypeError);
    expect(() => minorDigits('')).toThrow(TypeError);
    expect(() => minorDigits(' USD ')).toThrow(TypeError);
  });

  it('names the offending code, so the failure is actionable without a debugger', () => {
    expect(() => minorDigits('usd')).toThrow(/usd/);
  });
});

describe('minorDigits (pinned against the runtime’s currency data)', () => {
  it.each(DIVERGES_FROM_ISO_4217)(
    '%s stays at %i digits, where ISO 4217 says %i',
    (code, ours, iso) => {
      expect(minorDigits(code)).toBe(ours);
      expect(ours).not.toBe(iso);
    },
  );

  it('keeps the currencies where the two agree, so the pin is about drift and not about ICU', () => {
    // If this block ever fails, the runtime's data moved for an ordinary currency — which is a
    // much bigger deal than the sixteen above, and would change the scale of stored money.
    expect(minorDigits('USD')).toBe(2);
    expect(minorDigits('EUR')).toBe(2);
    expect(minorDigits('RUB')).toBe(2);
    expect(minorDigits('PLN')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
    expect(minorDigits('BHD')).toBe(3);
    expect(minorDigits('CLF')).toBe(4);
  });
});

describe('isCurrencyCode', () => {
  it('accepts a well-formed code', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('JPY')).toBe(true);
  });

  it('rejects a malformed one', () => {
    expect(isCurrencyCode('usd')).toBe(false);
    expect(isCurrencyCode('US')).toBe(false);
    expect(isCurrencyCode('USDD')).toBe(false);
    expect(isCurrencyCode('U5D')).toBe(false);
    expect(isCurrencyCode('')).toBe(false);
  });

  it('says nothing about whether the currency exists', () => {
    // Deliberate, and the reason the check is only about shape: ICU answers 2 for a code it
    // does not know, so this cannot be the gate on real currencies — and nothing else is one
    // yet. The list a budget may choose from still has to be written where budgets are
    // created; until then a nonexistent code reaching the API is the caller's own doing.
    expect(isCurrencyCode('ZZZ')).toBe(true);
    expect(minorDigits('ZZZ')).toBe(2);
  });
});
