/**
 * Money convention for Rondo Money.
 *
 * Money is always integer minor units (e.g. cents) held in `bigint` — never a float.
 * The number of minor digits is derived from the budget currency (ISO 4217), never
 * hardcoded to 2, so this type carries no scale of its own.
 *
 * JSON has no native bigint, so money crosses the wire as a base-10 **string**. Every
 * DTO that exposes a money field types it as {@link Money} in code and serializes it
 * with {@link serializeMoney} at the edge; clients parse it back with {@link parseMoney}.
 */
export type Money = bigint;

/** Serialize money (minor units) to a base-10 string for transport. */
export function serializeMoney(value: Money): string {
  return value.toString(10);
}

/**
 * Parse a transport string back to {@link Money}.
 *
 * Accepts only an optional leading `-` followed by digits — the exact shape
 * {@link serializeMoney} produces. Rejects decimals, whitespace, and other noise so a
 * malformed amount fails loudly instead of silently truncating.
 */
export function parseMoney(value: string): Money {
  if (!/^-?\d+$/.test(value)) {
    throw new TypeError(`Invalid money string: ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}
