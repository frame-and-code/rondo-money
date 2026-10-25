import { en, enPlurals } from './en';
import { pl, plPlurals } from './pl';
import { ru, ruPlurals, type MessageKey, type PluralKey } from './ru';

import type { Locale } from '../locales';
import type { PluralForms } from '../plural';

export type { MessageKey, PluralKey };

export const messages: Record<Locale, Record<MessageKey, string>> = { ru, en, pl };

export const plurals: { [L in Locale]: Record<PluralKey, PluralForms<L>> } = {
  ru: ruPlurals,
  en: enPlurals,
  pl: plPlurals,
};
