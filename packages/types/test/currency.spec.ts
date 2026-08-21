import { isCurrencyCode, minorDigits } from '@rondo/types';

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
    expect(isCurrencyCode('ZZZ')).toBe(true);
    expect(minorDigits('ZZZ')).toBe(2);
  });
});
