export type Money = bigint;

export function serializeMoney(value: Money): string {
  return value.toString(10);
}

export const MONEY_MAX: Money = 9223372036854775807n;

export const MONEY_MIN: Money = -9223372036854775808n;

export function isStorableMoney(value: Money): boolean {
  return value >= MONEY_MIN && value <= MONEY_MAX;
}

export const MONEY_MAX_LENGTH = 20;

export const MONEY_PATTERN = /^(0|-?[1-9]\d*)$/;

export const MONEY_NON_NEGATIVE_PATTERN = /^(0|[1-9]\d*)$/;

export const MONEY_POSITIVE_PATTERN = /^[1-9]\d*$/;

export function parseMoney(value: string): Money {
  if (!MONEY_PATTERN.test(value)) {
    throw new TypeError(`Invalid money string: ${JSON.stringify(value)}`);
  }
  return BigInt(value);
}

function requireDigits(digits: number): number {
  if (!Number.isInteger(digits) || digits < 0) {
    throw new TypeError(`Invalid minor digit count: ${JSON.stringify(digits)}`);
  }

  return digits;
}

export function toDecimalString(value: Money, digits: number): string {
  requireDigits(digits);
  const negative = value < 0n;
  const absolute = (negative ? -value : value).toString(10);
  if (digits === 0) return negative ? `-${absolute}` : absolute;

  const padded = absolute.padStart(digits + 1, '0');
  const whole = padded.slice(0, -digits);
  const fraction = padded.slice(-digits);

  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function parseDecimalString(input: string, digits: number): Money {
  requireDigits(digits);
  const match = /^-?\d+(?:\.(\d+))?$/.exec(input);
  if (!match) {
    throw new TypeError(`Invalid decimal amount: ${JSON.stringify(input)}`);
  }

  const fraction = match[1] ?? '';
  if (fraction.length > digits) {
    throw new TypeError(`Amount ${JSON.stringify(input)} has more than ${digits} minor digit(s)`);
  }

  const whole = fraction === '' ? input : input.slice(0, -(fraction.length + 1));

  return BigInt(`${whole}${fraction.padEnd(digits, '0')}`);
}
