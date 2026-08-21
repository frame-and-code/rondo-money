/**
 * @rondo/types — shared DTOs and domain types for Rondo Money.
 *
 * Money is integer minor units in `bigint`, serialized as a string over the wire.
 * See {@link ./money.js}. Concrete DTOs are added alongside the features that introduce
 * them (see the development plan / PRD).
 */
export type { Money } from './money.js';
export {
  MONEY_MAX,
  MONEY_MAX_LENGTH,
  MONEY_MIN,
  MONEY_PATTERN,
  isStorableMoney,
  serializeMoney,
  parseMoney,
  toDecimalString,
  parseDecimalString,
} from './money.js';
export type { CurrencyCode } from './currency.js';
export { isCurrencyCode, minorDigits } from './currency.js';
export type { LanguageTag, UserSettingsDto } from './user-settings.js';
