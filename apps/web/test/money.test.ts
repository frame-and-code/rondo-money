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

describe('showing an amount', () => {
  it('renders at the digit count the budget was frozen at, not at two', () => {
    expect(moneyOf('ru-RU', 'JPY', 0).format(1000n).replace(/\s/gu, ' ')).toContain('1 000');
    expect(moneyOf('ru-RU', 'JPY', 0).format(1000n)).not.toContain(',00');
    expect(moneyOf('ru-RU', 'PLN', 2).format(1050n)).toContain('10,50');
    expect(moneyOf('ru-RU', 'KWD', 3).format(1005n)).toContain('1,005');
  });

  it('keeps the sign of an amount that went below zero', () => {
    expect(moneyOf('ru-RU', 'PLN', 2).format(-1250n)).toMatch(/^[−-]/);
  });

  it('reads back with its own marks what it just rendered', () => {
    for (const [currency, digits] of [
      ['PLN', 2],
      ['JPY', 0],
      ['KWD', 3],
    ] as const) {
      const money = moneyOf('ru-RU', currency, digits, { signed: true });
      const shown = money.format(-123456n).replace(money.symbol, '').trim();

      expect(money.read(shown).minor).toBe(-123456n);
    }
  });

  it('does not lose precision on an amount larger than a safe number', () => {
    const huge = 9_007_199_254_740_993n;

    expect(moneyOf('ru-RU', 'PLN', 2).format(huge)).toContain('90071992547409.93');
  });
});

describe('showing an amount with no currency beside it', () => {
  it('keeps the budget digit count rather than falling back to two', () => {
    expect(moneyOf('ru-RU', 'JPY', 0).plain(1000n)).not.toContain(',');
    expect(moneyOf('ru-RU', 'PLN', 2).plain(1050n)).toContain('10,50');
    expect(moneyOf('ru-RU', 'KWD', 3).plain(1005n)).toContain('1,005');
  });

  it('leaves the currency out, so the pair beside it reads as one amount', () => {
    const money = moneyOf('ru-RU', 'PLN', 2);

    expect(money.plain(2000050n)).not.toContain(money.symbol);
    expect(money.plain(2000050n).replace(/\s/gu, ' ')).toContain('20 000,50');
  });
});

describe('an amount whose fraction is nothing', () => {
  it('drops the decimals rather than printing zeros nobody reads', () => {
    const money = moneyOf('ru-RU', 'PLN', 2);

    expect(money.format(50000n)).not.toContain(',');
    expect(money.format(50000n)).toContain('500');
    expect(money.plain(50000n)).toBe('500');
    expect(money.format(0n)).not.toContain(',');
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
