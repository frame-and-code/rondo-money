export type CurrencyCode = string;

/// The shape of a currency code, published in the OpenAPI schema. The codes themselves are
/// not: they come from the runtime's ICU data, and a Node upgrade would rewrite the committed
/// contract on a change that touches no currency.
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
