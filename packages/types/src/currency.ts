export type CurrencyCode = string;

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function isCurrencyCode(value: string): boolean {
  return CURRENCY_CODE.test(value);
}

export function minorDigits(code: CurrencyCode): number {
  if (!isCurrencyCode(code)) {
    throw new TypeError(`Invalid currency code: ${JSON.stringify(code)}`);
  }

  const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(0);

  return parts.find((part) => part.type === 'fraction')?.value.length ?? 0;
}
