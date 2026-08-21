/**
 * Money convention for Rondo Money.
 *
 * Money is always integer minor units (e.g. cents) held in `bigint` — never a float.
 * The number of minor digits is derived from the budget currency, never hardcoded to 2, so
 * this type carries no scale of its own. Where that number comes from, and why it is not the
 * ISO 4217 exponent, is in {@link ./currency.js}.
 *
 * JSON has no native bigint, so money crosses the wire as a base-10 **string**. Every
 * DTO that exposes a money field types it as {@link Money} in code and serializes it
 * with {@link serializeMoney} at the edge; clients parse it back with {@link parseMoney}.
 */
import { minorDigits, type CurrencyCode } from './currency.js';

export type Money = bigint;

/** Serialize money (minor units) to a base-10 string for transport. */
export function serializeMoney(value: Money): string {
  return value.toString(10);
}

/**
 * The range an amount must fall in to be storable: a signed 64-bit integer, which is what a
 * `bigint` column is in Postgres.
 *
 * `bigint` in JavaScript is unbounded, so nothing about the type itself stops an amount the
 * database cannot hold. Without a check here such a value passes every shape test and fails at
 * the very end of a write, as a driver error that names no field — so the ceiling is stated
 * where money is defined rather than discovered where it is stored.
 */
export const MONEY_MAX: Money = 9223372036854775807n;

/** The other end of {@link MONEY_MAX}. */
export const MONEY_MIN: Money = -9223372036854775808n;

/** Whether an amount fits the column, i.e. lies within {@link MONEY_MIN}…{@link MONEY_MAX}. */
export function isStorableMoney(value: Money): boolean {
  return value >= MONEY_MIN && value <= MONEY_MAX;
}

/**
 * The most characters a storable amount can take: 19 digits plus a sign.
 *
 * Exported so a validator can refuse an absurd string by length before handing it to
 * `BigInt`, rather than parsing a hundred kilobytes to conclude it was never in range.
 */
export const MONEY_MAX_LENGTH = 20;

/**
 * The exact shape money takes on the wire — precisely what {@link serializeMoney} emits, and
 * nothing else: no leading zeros, and no negative zero.
 *
 * The strictness earns its keep twice. One amount then has exactly one spelling, so two
 * requests carrying the same money cannot differ byte for byte. And because a canonical string
 * cannot be padded, its **length bounds its value**: anything longer than
 * {@link MONEY_MAX_LENGTH} is necessarily outside {@link MONEY_MIN}…{@link MONEY_MAX}, which is
 * what lets the API boundary refuse an absurd amount before parsing it and still give the
 * honest reason. Allowing `007` would break that — `-09223372036854775808` is 21 characters
 * and exactly {@link MONEY_MIN}.
 *
 * Exported because the boundary needs the same rule in two more places — the validator that
 * refuses a malformed amount and the `pattern` published in the OpenAPI schema — and three
 * copies of one regular expression is three chances for the contract, the guard and the parser
 * to disagree about what money looks like.
 */
export const MONEY_PATTERN = /^(0|-?[1-9]\d*)$/;

/**
 * Parse a transport string back to {@link Money}.
 *
 * Accepts only the shape {@link serializeMoney} produces ({@link MONEY_PATTERN}). Rejects
 * decimals, whitespace, padded forms like `007` and other noise, so a malformed amount fails
 * loudly instead of being silently truncated or silently normalised.
 */
export function parseMoney(value: string): Money {
  if (!MONEY_PATTERN.test(value)) {
    throw new TypeError(`Invalid money string: ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

/**
 * Money as a person reads and writes it: `1250n` in USD is `"12.50"`, in JPY `"1250"`.
 *
 * Not a rendering. There is no currency symbol, no grouping separator and no locale-specific
 * decimal mark — this converts the *scale*, and only the scale. Formatting an amount for a
 * screen belongs to the UI, which puts `Intl.NumberFormat` on top of the digit count
 * {@link minorDigits} owns here.
 */
export function toDecimalString(value: Money, currency: CurrencyCode): string {
  const digits = minorDigits(currency);
  const negative = value < 0n;
  // Sign is taken off first and put back at the end, so it stays in front of the whole amount:
  // -5 in USD is "-0.05", and splitting the digits of "-5" would put it inside the fraction.
  const absolute = (negative ? -value : value).toString(10);
  if (digits === 0) return negative ? `-${absolute}` : absolute;

  const padded = absolute.padStart(digits + 1, '0');
  const whole = padded.slice(0, -digits);
  const fraction = padded.slice(-digits);

  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/**
 * Read a decimal amount back into minor units: `"12.50"` in USD is `1250n`.
 *
 * Fewer fractional digits than the currency has are padded, because that is what a person
 * types — `12.5` is twelve fifty. **More are refused**, and refused even when nothing would be
 * lost: `"12.500"` in USD is rejected rather than read as twelve fifty. An amount carrying more
 * precision than its currency defines is far more likely a currency mixed up than a deliberate
 * trailing zero, and the alternative — deciding case by case which extra digits are safe to
 * drop — is how a rounding bug gets in. The amount someone entered and the amount that gets
 * stored have to be the same number, which is what {@link parseMoney} already refuses to
 * compromise on.
 */
export function parseDecimalString(input: string, currency: CurrencyCode): Money {
  const digits = minorDigits(currency);
  const match = /^-?\d+(?:\.(\d+))?$/.exec(input);
  if (!match) {
    throw new TypeError(`Invalid decimal amount: ${JSON.stringify(input)}`);
  }

  const fraction = match[1] ?? '';
  if (fraction.length > digits) {
    throw new TypeError(
      `Amount ${JSON.stringify(input)} has more than ${digits} minor digit(s) for ${currency}`,
    );
  }

  // The sign and the whole part are carried across as they were written rather than captured
  // separately — the groups the regex guarantees are still typed as optional, and the
  // unreachable defaults that would need are branches no test can ever cover.
  const whole = fraction === '' ? input : input.slice(0, -(fraction.length + 1));

  return BigInt(`${whole}${fraction.padEnd(digits, '0')}`);
}
