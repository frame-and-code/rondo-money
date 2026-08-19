import { type Language } from '@rondo/db';
import { type LanguageTag } from '@rondo/types';

/**
 * The two spellings of an interface language, and the only place that knows both.
 *
 * Postgres stores the enum in upper case (`packages/db/prisma/schema.prisma`); the wire, the
 * `Accept-Language` header and `<html lang>` all speak lower-case BCP 47 primary subtags.
 * `Record<Language, …>` is what keeps the two in step: adding a value to the Prisma enum
 * stops compiling here until it is mapped, and a row nobody can render is exactly the bug a
 * quietly-defaulting lookup would ship instead.
 *
 * Both imports are types only. `@rondo/types` has no build step, so importing a *value* from
 * it would leave a `require('@rondo/types')` in `dist` resolving to a `.ts` file — the api
 * would build and then fail to boot.
 */
const TAG_BY_LANGUAGE: Record<Language, LanguageTag> = { RU: 'ru', EN: 'en', PL: 'pl' };

const LANGUAGE_BY_TAG: Record<LanguageTag, Language> = { ru: 'RU', en: 'EN', pl: 'PL' };

/**
 * Every supported tag, in the schema's order — derived from the map above rather than listed
 * again, so the OpenAPI enum cannot fall out of step with what the database accepts.
 */
export const LANGUAGE_TAGS = Object.values(TAG_BY_LANGUAGE);

/**
 * What an unrecognised language falls back to.
 *
 * English, deliberately: it supersedes the RU-first default of F0.7. The PRD stays the RU
 * source of truth — that is a document, not the interface a stranger's browser asks for.
 */
export const DEFAULT_LANGUAGE_TAG: LanguageTag = 'en';

/** Narrows an arbitrary string to a supported tag, so no call site needs a cast. */
export function isLanguageTag(value: string): value is LanguageTag {
  return Object.hasOwn(LANGUAGE_BY_TAG, value);
}

/** Stored enum → the tag clients receive. */
export function toLanguageTag(language: Language): LanguageTag {
  return TAG_BY_LANGUAGE[language];
}

/** Tag → the enum value Postgres stores. */
export function toLanguage(tag: LanguageTag): Language {
  return LANGUAGE_BY_TAG[tag];
}
