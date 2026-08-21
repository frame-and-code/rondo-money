/**
 * Currency codes, and the one thing the money type needs from them: how many minor digits an
 * amount in that currency has. Money itself carries no scale — see {@link ./money.js} — so
 * this is what tells a bare `bigint` where its decimal mark goes.
 *
 * The digit count comes from the runtime's currency data (ICU/CLDR), which is **not** the same
 * as the ISO 4217 exponent, and the difference is deliberate. ISO still defines two minor
 * digits for the forint; the fillér was withdrawn in 1999, and a budget shown in HUF with two
 * decimal places is wrong in the only way a user would notice. Sixteen currencies differ this
 * way, all of them ones whose minor unit has left circulation, and every one is pinned in
 * `test/currency.spec.ts` — because this number decides the scale money is stored at, and it
 * ships with the runtime rather than with us.
 */

/** A three-letter alphabetic currency code, as it is stored and as it crosses the wire. */
export type CurrencyCode = string;

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * Whether a string has the shape of a currency code.
 *
 * Shape only, and upper case only. Accepting `usd` alongside `USD` would let both spellings
 * reach a database column that has no opinion about which is right.
 */
export function isCurrencyCode(value: string): boolean {
  return CURRENCY_CODE.test(value);
}

/**
 * How many minor digits an amount in this currency has: JPY 0, USD 2, BHD 3, CLF 4 — and HUF 0,
 * which ISO 4217 would call 2 (see the header).
 *
 * Read through `Intl` rather than from a table we would have to maintain — the data ships with
 * the platform, which is what the dependency rule asks for.
 *
 * ⚠️ Once a budget exists, its digit count must be **frozen on the budget row** rather than
 * recomputed on every read. This function's answer can move under a runtime upgrade, and an
 * amount stored at one scale and read back at another is money silently multiplied by a
 * hundred.
 */
export function minorDigits(code: CurrencyCode): number {
  if (!isCurrencyCode(code)) {
    throw new TypeError(`Invalid currency code: ${JSON.stringify(code)}`);
  }

  // ICU returns 2 for unknown codes, so nothing here restricts a code to a real currency yet;
  // the list a budget may choose from has to be written where budgets are created.
  //
  // The locale is pinned to `en` because the digit count is a property of the currency, not of
  // who is reading it — a locale-dependent one would make storage depend on the reader.
  //
  // Counted off a formatted zero rather than read from `resolvedOptions()`, whose
  // `maximumFractionDigits` is typed `number | undefined`: the only ways to satisfy that are a
  // cast, which the code-quality rule forbids, or a fallback digit count, which is precisely
  // the plausible-looking guess that must never decide how money is stored. A currency with no
  // minor unit emits no `fraction` part at all, which is the zero below.
  const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(0);

  return parts.find((part) => part.type === 'fraction')?.value.length ?? 0;
}
