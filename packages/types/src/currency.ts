export type CurrencyCode = string;

export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export function isCurrencyCode(value: string): boolean {
  return CURRENCY_PATTERN.test(value);
}

const SUPPORTED: readonly CurrencyCode[] = Object.freeze(
  Intl.supportedValuesOf('currency').filter(isCurrencyCode),
);

const SUPPORTED_INDEX: ReadonlySet<CurrencyCode> = new Set(SUPPORTED);

export function supportedCurrencyCodes(): readonly CurrencyCode[] {
  return SUPPORTED;
}

export function isSupportedCurrency(value: string): boolean {
  return SUPPORTED_INDEX.has(value);
}

export function minorDigits(code: CurrencyCode): number {
  if (!isCurrencyCode(code)) {
    throw new TypeError(`Invalid currency code: ${JSON.stringify(code)}`);
  }

  const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(0);

  return parts.find((part) => part.type === 'fraction')?.value.length ?? 0;
}
