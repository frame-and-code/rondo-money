/**
 * A user's own settings — the shape the API publishes, not the row.
 *
 * Only what a screen needs: the row's id and timestamps are the backend's business, and a
 * field published once is much harder to withdraw than to add.
 */

/**
 * The interface languages the app ships (F0.7 — RU / EN / PL).
 *
 * BCP 47 primary subtags in lower case, because that is what an `Accept-Language` header,
 * `navigator.languages` and the `<html lang>` attribute all speak. The database stores the
 * same three as an enum in upper case; `apps/api/src/user-settings/language.ts` owns the
 * mapping between the two, and is the only place that knows both spellings.
 */
export type LanguageTag = 'ru' | 'en' | 'pl';

export interface UserSettingsDto {
  language: LanguageTag;
}
