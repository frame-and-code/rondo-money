import { interpolate } from './interpolate';
import { plurals, type PluralKey } from './messages';

import type { Locale } from './locales';

export const pluralCategories = {
  ru: ['one', 'few', 'many', 'other'],
  en: ['one', 'other'],
  pl: ['one', 'few', 'many', 'other'],
} as const satisfies Record<Locale, readonly Intl.LDMLPluralRule[]>;

export type PluralForms<L extends Locale> = Record<(typeof pluralCategories)[L][number], string>;

type AnyForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

const rules = new Map<Locale, Intl.PluralRules>();

function rulesOf(locale: Locale): Intl.PluralRules {
  const known = rules.get(locale);
  if (known) return known;

  const made = new Intl.PluralRules(locale);
  rules.set(locale, made);
  return made;
}

export function translatePlural(
  locale: Locale,
  key: PluralKey,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const forms: AnyForms = plurals[locale][key];

  return interpolate(forms[rulesOf(locale).select(count)] ?? forms.other, vars);
}
