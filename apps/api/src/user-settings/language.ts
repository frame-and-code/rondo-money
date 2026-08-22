import { type Language } from '@rondo/db';
import { type LanguageTag } from '@rondo/types';

const TAG_BY_LANGUAGE: Record<Language, LanguageTag> = { RU: 'ru', EN: 'en', PL: 'pl' };

const LANGUAGE_BY_TAG: Record<LanguageTag, Language> = { ru: 'RU', en: 'EN', pl: 'PL' };

export const LANGUAGE_TAGS = Object.values(TAG_BY_LANGUAGE);

export const DEFAULT_LANGUAGE_TAG: LanguageTag = 'en';

export function isLanguageTag(value: string): value is LanguageTag {
  return Object.hasOwn(LANGUAGE_BY_TAG, value);
}

export function toLanguageTag(language: Language): LanguageTag {
  return TAG_BY_LANGUAGE[language];
}

export function toLanguage(tag: LanguageTag): Language {
  return LANGUAGE_BY_TAG[tag];
}
