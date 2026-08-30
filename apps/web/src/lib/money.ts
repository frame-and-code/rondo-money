import { parseDecimalString, toDecimalString } from '@rondo/types';

export interface Marks {
  group: string;
  decimal: string;
}

export type AmountFault = 'negative' | 'shape' | 'digits';

export interface Amount {
  minor: bigint | null;
  fault: AmountFault | null;
  typed: boolean;
  partial: boolean;
}

export interface MoneyReader {
  format: (minor: bigint) => string;
  plain: (minor: bigint) => string;
  typed: (minor: bigint) => string;
  symbol: string;
  digits: number;
  currency: string;
  marks: Marks;
  read: (raw: string) => Amount;
}

export function marksOf(locale: string): Marks {
  const parts = new Intl.NumberFormat(locale).formatToParts(11111.1);

  return {
    group: parts.find((part) => part.type === 'group')?.value ?? '',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
  };
}

function quoted(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeAmount(group: string): RegExp {
  const mark = group === '' || /\s/.test(group) ? '\\s' : `[${quoted(group)}\\s]`;

  return new RegExp(`^(?:\\d+|\\d{1,3}(?:${mark}\\d{3})+)$`);
}

function decimalMarks(marks: Marks): readonly string[] {
  return marks.decimal === '.' || marks.group === '.' ? [marks.decimal] : [marks.decimal, '.'];
}

const MINUS = /[-−]/;

const SIGN = /(?=[+\-−])/;

function readFactor(raw: string, marks: Marks): { by: bigint; scale: bigint } | null {
  const body = raw.trim();
  const mark = decimalMarks(marks).find((candidate) => body.includes(candidate));
  const parts = mark === undefined ? [body] : body.split(mark);
  const [whole = '', fraction = ''] = parts;

  if (
    parts.length > 2 ||
    (whole === '' ? fraction === '' : !wholeAmount(marks.group).test(whole))
  ) {
    return null;
  }

  if (fraction !== '' && !/^\d+$/.test(fraction)) {
    return null;
  }

  const plain = whole === '' ? '' : whole.replace(/\s/g, '').split(marks.group).join('');

  return { by: BigInt(`${plain}${fraction}`), scale: 10n ** BigInt(fraction.length) };
}

function rounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const top = numerator < 0n ? -numerator : numerator;
  const bottom = denominator < 0n ? -denominator : denominator;
  const whole = top / bottom;
  const rest = top % bottom;
  const up = rest * 2n >= bottom ? whole + 1n : whole;

  return negative ? -up : up;
}

function readProduct(raw: string, digits: number, marks: Marks): Amount {
  const [first = '', ...rest] = raw.split(/([*/])/);
  if (rest.length > 0 && first.trim() === '') {
    return { minor: null, fault: 'shape', typed: true, partial: false };
  }

  const amount = readTerm(first, digits, marks);
  if (amount.minor === null || rest.length === 0) {
    return amount;
  }

  let numerator = amount.minor;
  let denominator = 1n;

  for (let at = 0; at < rest.length; at += 2) {
    const factor = readFactor(rest[at + 1] ?? '', marks);
    if (factor === null) {
      return { minor: null, fault: 'shape', typed: true, partial: false };
    }

    if (rest[at] === '*') {
      numerator *= factor.by;
      denominator *= factor.scale;
      continue;
    }

    if (factor.by === 0n) {
      return { minor: null, fault: 'shape', typed: true, partial: false };
    }

    numerator *= factor.scale;
    denominator *= factor.by;
  }

  return { minor: rounded(numerator, denominator), fault: null, typed: true, partial: false };
}

function readTerm(raw: string, digits: number, marks: Marks): Amount {
  const body = raw.trim();
  if (body === '') {
    return { minor: 0n, fault: null, typed: true, partial: true };
  }

  const used = decimalMarks(marks).filter((mark) => body.includes(mark));
  const parts = body.split(used[0] ?? marks.decimal);
  const [whole = '', fraction = ''] = parts;
  if (parts.length > 2 || (whole !== '' && !wholeAmount(marks.group).test(whole))) {
    return { minor: null, fault: 'shape', typed: true, partial: false };
  }

  if (fraction !== '' && !/^\d+$/.test(fraction)) {
    return { minor: null, fault: 'shape', typed: true, partial: false };
  }

  if (fraction.length > digits) {
    return { minor: null, fault: 'digits', typed: true, partial: false };
  }

  const plain = whole === '' ? '0' : whole.replace(/\s/g, '').split(marks.group).join('');
  const normalized = fraction === '' ? plain : `${plain}.${fraction}`;

  return {
    minor: parseDecimalString(normalized, digits),
    fault: null,
    typed: true,
    partial: false,
  };
}

export function readAmount(
  raw: string,
  digits: number,
  marks: Marks,
  options: { signed?: boolean } = {},
): Amount {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { minor: 0n, fault: null, typed: false, partial: false };
  }

  let total = 0n;
  let partial = false;

  for (const piece of trimmed.split(SIGN)) {
    const negative = MINUS.test(piece.slice(0, 1));
    const term = readProduct(
      negative || piece.startsWith('+') ? piece.slice(1) : piece,
      digits,
      marks,
    );

    if (term.minor === null) {
      return term;
    }

    total += negative ? -term.minor : term.minor;
    partial = partial || term.partial;
  }

  if (total < 0n && options.signed !== true) {
    return { minor: null, fault: 'negative', typed: true, partial };
  }

  return { minor: total, fault: null, typed: true, partial };
}

export function moneyOf(
  locale: string,
  currency: string,
  digits: number,
  options: { signed?: boolean } = {},
): MoneyReader {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const bare = new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: true,
  });
  const roundBare = new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: true,
  });
  const scale = 10n ** BigInt(digits);
  const whole = (minor: bigint): boolean => minor % scale === 0n;
  const parts = formatter.formatToParts(0);
  const symbolAt = parts.findIndex((part) => part.type === 'currency');
  const symbol = parts[symbolAt]?.value ?? currency;
  const marks = marksOf(locale);
  const withSymbol = (amount: string): string => `${amount}\u00a0${symbol}`;
  const exactly = (minor: bigint): string => {
    const decimal = toDecimalString(minor, digits);

    return digits > 0 && whole(minor) ? decimal.slice(0, -(digits + 1)) : decimal;
  };

  return {
    format: (minor) => {
      const decimal = toDecimalString(minor, digits);
      const asNumber = Number(decimal);

      if (asNumber.toFixed(digits) !== decimal) {
        return withSymbol(exactly(minor));
      }

      return withSymbol(whole(minor) ? roundBare.format(asNumber) : bare.format(asNumber));
    },
    plain: (minor) => {
      const decimal = toDecimalString(minor, digits);
      const asNumber = Number(decimal);

      if (asNumber.toFixed(digits) !== decimal) {
        return exactly(minor);
      }

      return whole(minor) ? roundBare.format(asNumber) : bare.format(asNumber);
    },
    typed: (minor) => toDecimalString(minor, digits).replace('.', marks.decimal),
    symbol,
    digits,
    currency,
    marks,
    read: (raw) => readAmount(raw, digits, marks, options),
  };
}
