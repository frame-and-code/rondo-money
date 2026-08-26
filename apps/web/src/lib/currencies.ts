import { supportedCurrencyCodes, type CurrencyCode } from '@rondo/types';

import { type Locale } from '@/i18n/locales';

export interface CurrencyOption {
  code: CurrencyCode;
  name: string;
}

const byLocale = new Map<Locale, readonly CurrencyOption[]>();

export function currencyOptions(locale: Locale): readonly CurrencyOption[] {
  const known = byLocale.get(locale);
  if (known) {
    return known;
  }

  const names = new Intl.DisplayNames([locale], { type: 'currency' });
  const options = supportedCurrencyCodes()
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((left, right) => left.name.localeCompare(right.name, locale));

  byLocale.set(locale, options);
  return options;
}

export function searchCurrencies(
  options: readonly CurrencyOption[],
  query: string,
): readonly CurrencyOption[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return options;
  }

  const rank = (option: CurrencyOption): number =>
    option.code.toLocaleLowerCase().startsWith(needle) ? 0 : 1;

  return options
    .filter((option) => `${option.code} ${option.name}`.toLocaleLowerCase().includes(needle))
    .sort((left, right) => rank(left) - rank(right) || left.code.localeCompare(right.code));
}

export function currencyName(locale: Locale, code: string): string {
  const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;

  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}

export function sampleAmount(locale: Locale, code: CurrencyCode): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(1234.5);
}
