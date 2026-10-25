import { marksOf, moneyOf, readAmount } from '@/lib/money';

const ru = (): ReturnType<typeof marksOf> => marksOf('ru-RU');
const en = (): ReturnType<typeof marksOf> => marksOf('en-US');

describe('reading an amount a person typed', () => {
  it('reads the same number through the marks of either locale', () => {
    expect(readAmount('1 234,56', 2, ru()).minor).toBe(123456n);
    expect(readAmount('1,234.56', 2, en()).minor).toBe(123456n);
  });

  it('takes a minus when the field allows a sign, and refuses one when it does not', () => {
    expect(readAmount('-12,50', 2, ru(), { signed: true }).minor).toBe(-1250n);
    expect(readAmount('-12,50', 2, ru()).fault).toBe('negative');
  });

  it('reads a lone minus as zero rather than as a broken amount, because it is mid-typing', () => {
    expect(readAmount('-', 2, ru(), { signed: true })).toMatchObject({ minor: 0n, fault: null });
  });

  it('says an expression is unfinished, so a trailing operator never commits its left side', () => {
    expect(readAmount('100+', 2, ru())).toMatchObject({ minor: 10000n, partial: true });
    expect(readAmount('100-', 2, ru())).toMatchObject({ minor: 10000n, partial: true });
    expect(readAmount('100++50', 2, ru())).toMatchObject({ partial: true });
    expect(readAmount('-', 2, ru(), { signed: true }).partial).toBe(true);
    expect(readAmount('100+50', 2, ru()).partial).toBe(false);
    expect(readAmount('', 2, ru()).partial).toBe(false);
  });

  it('refuses more minor digits than the currency has', () => {
    expect(readAmount('12,505', 2, ru()).fault).toBe('digits');
    expect(readAmount('12,5', 0, ru()).fault).toBe('digits');
    expect(readAmount('12', 0, ru()).minor).toBe(12n);
  });

  it('refuses anything that is not an amount', () => {
    expect(readAmount('12,5,5', 2, ru()).fault).toBe('shape');
    expect(readAmount('abc', 2, ru()).fault).toBe('shape');
    expect(readAmount('1 2 3', 2, en()).fault).toBe('shape');
  });

  it('reads an empty field as zero and says nobody typed it, so a cleared cell means zero', () => {
    expect(readAmount('', 2, ru())).toMatchObject({ minor: 0n, typed: false });
    expect(readAmount('   ', 2, ru(), { signed: true })).toMatchObject({ minor: 0n, typed: false });
  });
});

describe('arithmetic a person types instead of doing it in their head', () => {
  it('adds and subtracts, so topping an envelope up needs no mental sum', () => {
    expect(readAmount('434+35', 2, ru()).minor).toBe(46900n);
    expect(readAmount('450+20', 2, ru()).minor).toBe(47000n);
    expect(readAmount('500-65', 2, ru()).minor).toBe(43500n);
  });

  it('counts in minor units, so no cent is lost to a float', () => {
    expect(readAmount('0,01+0,02', 2, ru()).minor).toBe(3n);
    expect(readAmount('12,10+0,05', 2, ru()).minor).toBe(1215n);
  });

  it('takes more than two terms, and spaces around the signs', () => {
    expect(readAmount('100+20+5', 2, ru()).minor).toBe(12500n);
    expect(readAmount('100 + 20 - 5', 2, ru()).minor).toBe(11500n);
  });

  it('lands below zero only where the field allows a sign', () => {
    expect(readAmount('20-50', 2, ru(), { signed: true }).minor).toBe(-3000n);
    expect(readAmount('20-50', 2, ru()).fault).toBe('negative');
    expect(readAmount('-20+50', 2, ru()).minor).toBe(3000n);
  });

  it('refuses a term that is not an amount, rather than counting the rest', () => {
    expect(readAmount('100+abc', 2, ru()).fault).toBe('shape');
    expect(readAmount('100+1,005', 2, ru()).fault).toBe('digits');
  });

  it('multiplies, because three times two fifty is not a sum anyone wants to type', () => {
    expect(readAmount('250*3', 2, ru()).minor).toBe(75000n);
    expect(readAmount('3*250', 2, ru()).minor).toBe(75000n);
    expect(readAmount('12,50*4', 2, ru()).minor).toBe(5000n);
    expect(readAmount('2,5*4', 2, ru()).minor).toBe(1000n);
  });

  it('binds a product tighter than a sum', () => {
    expect(readAmount('434+35*2', 2, ru()).minor).toBe(50400n);
    expect(readAmount('100-10*3', 2, ru()).minor).toBe(7000n);
  });

  it('divides, and rounds to the nearest minor unit', () => {
    expect(readAmount('1000/4', 2, ru()).minor).toBe(25000n);
    expect(readAmount('1000/3', 2, ru()).minor).toBe(33333n);
    expect(readAmount('0,03*0,5', 2, ru()).minor).toBe(2n);
    expect(readAmount('0,01*0,5', 2, ru()).minor).toBe(1n);
  });

  it('rounds once at the end, so a division undone by a product comes back whole', () => {
    expect(readAmount('1000/3*3', 2, ru()).minor).toBe(100000n);
    expect(readAmount('100/7*7', 2, ru()).minor).toBe(10000n);
  });

  it('refuses a term that starts with an operator, rather than reading it as nothing', () => {
    expect(readAmount('*3', 2, ru()).fault).toBe('shape');
    expect(readAmount('/3', 2, ru()).fault).toBe('shape');
    expect(readAmount('  *3  ', 2, ru()).fault).toBe('shape');
    expect(readAmount('100+*3', 2, ru()).fault).toBe('shape');
  });

  it('reads a grouped factor on either side of the sign, so the two orders agree', () => {
    expect(readAmount('2*1,000', 2, en()).minor).toBe(readAmount('1,000*2', 2, en()).minor);
    expect(readAmount('2*1,000', 2, en()).minor).toBe(200000n);
    expect(readAmount('2*1 000', 2, ru()).minor).toBe(200000n);
    expect(readAmount('2*1,2,3', 2, en()).fault).toBe('shape');
  });

  it('reads a factor written without its whole part, on either side of the sign', () => {
    expect(readAmount('2*.5', 2, en()).minor).toBe(readAmount('.5*2', 2, en()).minor);
    expect(readAmount('2*.5', 2, en()).minor).toBe(100n);
    expect(readAmount('2*,5', 2, ru()).minor).toBe(100n);
    expect(readAmount('100/.5', 2, en()).minor).toBe(20000n);
  });

  it('refuses a product left hanging, rather than reading its missing factor as zero', () => {
    expect(readAmount('100*', 2, ru()).fault).toBe('shape');
    expect(readAmount('100/', 2, ru()).fault).toBe('shape');
    expect(readAmount('100 * ', 2, ru()).fault).toBe('shape');
    expect(readAmount('100**2', 2, ru()).fault).toBe('shape');
    expect(readAmount('100*+2', 2, ru()).fault).toBe('shape');
  });

  it('refuses a division by nothing rather than answering with infinity', () => {
    expect(readAmount('100/0', 2, ru()).fault).toBe('shape');
  });

  it('reads a plain amount as the one term it is', () => {
    expect(readAmount('434', 2, ru()).minor).toBe(43400n);
    expect(readAmount('1 234,56', 2, ru()).minor).toBe(123456n);
  });
});

const LOCALES = ['en-US', 'ru-RU', 'pl-PL'] as const;

describe('showing an amount the way its locale writes money', () => {
  it.each([
    ['en-US', 'USD', 2, 1234567n, '$12,345.67'],
    ['en-US', 'EUR', 2, 1234567n, '€12,345.67'],
    ['en-US', 'JPY', 0, 12345n, '¥12,345'],
    ['en-US', 'KWD', 3, 12345678n, 'KWD 12,345.678'],
    ['en-US', 'CLF', 4, 12345n, 'CLF\u00a01.2345'],
    ['en-US', 'USD', 2, -5n, '-$0.05'],
    ['ru-RU', 'USD', 2, 1234567n, '12 345,67 $'],
    ['ru-RU', 'EUR', 2, 1234567n, '12 345,67 €'],
    ['ru-RU', 'JPY', 0, 12345n, '12 345 ¥'],
    ['ru-RU', 'KWD', 3, 12345678n, '12 345,678 KWD'],
    ['pl-PL', 'USD', 2, 1234567n, '12 345,67 $'],
    ['pl-PL', 'EUR', 2, 1234567n, '12 345,67 €'],
    ['pl-PL', 'JPY', 0, 12345n, '12 345 ¥'],
    ['pl-PL', 'KWD', 3, 12345678n, '12 345,678 KWD'],
  ] as const)('writes %s %s at %i digits as %#', (locale, currency, digits, minor, expected) => {
    expect(moneyOf(locale, currency, digits).format(minor)).toBe(expected);
  });

  it.each([
    ['en-US', '-$1,250.50'],
    ['ru-RU', '-1 250,50 $'],
    ['pl-PL', '-1250,50 $'],
  ] as const)('puts the minus where %s puts it', (locale, expected) => {
    expect(moneyOf(locale, 'USD', 2, { signed: true }).format(-125050n)).toBe(expected);
  });

  it.each([
    ['en-US', '$1,234.56', '1,234.56'],
    ['ru-RU', '1 234,56 $', '1 234,56'],
    ['pl-PL', '1234,56 $', '1234,56'],
  ] as const)(
    'groups four digits the way %s does, with or without the symbol',
    (locale, shown, bare) => {
      const money = moneyOf(locale, 'USD', 2);

      expect(money.format(123456n)).toBe(shown);
      expect(money.plain(123456n)).toBe(bare);
    },
  );

  it('renders at the digit count the budget was frozen at, not at the currency default', () => {
    expect(moneyOf('en-US', 'USD', 3).format(1005n)).toBe('$1.005');
    expect(moneyOf('ru-RU', 'KWD', 2).format(1050n)).toBe('10,50 KWD');
  });

  it.each(LOCALES)('reads back in %s what it just rendered, below zero too', (locale) => {
    for (const [currency, digits] of [
      ['USD', 2],
      ['EUR', 2],
      ['JPY', 0],
      ['KWD', 3],
    ] as const) {
      const money = moneyOf(locale, currency, digits, { signed: true });

      for (const minor of [123456n, -123456n, 12345678n, -5n]) {
        const shown = money.format(minor).replace(money.symbol, '').trim();

        expect(money.read(shown).minor).toBe(minor);
      }
    }
  });

  it.each([
    ['en-US', '$90,071,992,547,409.93'],
    ['ru-RU', '90 071 992 547 409,93 $'],
  ] as const)(
    'does not lose a cent in %s on an amount larger than a safe number',
    (locale, expected) => {
      expect(moneyOf(locale, 'USD', 2).format(9_007_199_254_740_993n)).toBe(expected);
    },
  );
});

describe('showing an amount with no currency beside it', () => {
  it('keeps the budget digit count rather than falling back to two', () => {
    expect(moneyOf('ru-RU', 'JPY', 0).plain(1000n)).toBe('1 000');
    expect(moneyOf('ru-RU', 'PLN', 2).plain(1050n)).toBe('10,50');
    expect(moneyOf('ru-RU', 'KWD', 3).plain(1005n)).toBe('1,005');
  });

  it('leaves the currency out', () => {
    const money = moneyOf('ru-RU', 'PLN', 2);

    expect(money.plain(2000050n)).toBe('20 000,50');
  });
});

describe('the first amount of a pair that shares one currency', () => {
  it('leaves the currency to the second where the locale writes it after a number', () => {
    expect(moneyOf('ru-RU', 'PLN', 2).pairStart(20000n)).toBe('200');
    expect(moneyOf('pl-PL', 'PLN', 2).pairStart(20000n)).toBe('200');
  });

  it('names it where the locale writes it first, so the first amount never reads as bare', () => {
    expect(moneyOf('en-US', 'USD', 2).pairStart(20000n)).toBe('$200');
  });
});

describe('an amount whose fraction is nothing', () => {
  it.each([
    ['en-US', '$500', '$0'],
    ['ru-RU', '500 zł', '0 zł'],
    ['pl-PL', '500 zł', '0 zł'],
  ] as const)('drops the decimals in %s rather than printing zeros', (locale, whole, zero) => {
    const currency = locale === 'en-US' ? 'USD' : 'PLN';
    const money = moneyOf(locale, currency, 2);

    expect(money.format(50000n)).toBe(whole);
    expect(money.plain(50000n)).toBe('500');
    expect(money.format(0n)).toBe(zero);
  });

  it('drops the zeros on a whole amount too big for a double to carry', () => {
    const money = moneyOf('en-US', 'USD', 2);
    const huge = 900719925474099300n;

    expect(money.plain(huge)).toBe('9,007,199,254,740,993');
    expect(money.plain(huge + 7n)).toBe('9,007,199,254,740,993.07');
  });
  it('keeps every decimal the moment one of them is not a zero', () => {
    const money = moneyOf('ru-RU', 'PLN', 2);

    expect(money.format(50060n)).toContain('500,60');
    expect(money.format(50006n)).toContain('500,06');
  });

  it('leaves a field being typed into alone, where a trimmed decimal would fight the caret', () => {
    const money = moneyOf('ru-RU', 'PLN', 2);

    expect(money.typed(50000n)).toBe('500,00');
    expect(money.typed(0n)).toBe('0,00');
    expect(money.typed(50060n)).toBe('500,60');
  });
});
