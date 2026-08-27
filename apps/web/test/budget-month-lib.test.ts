import { monthFromUrl, monthLabel, monthNow, spendRing } from '@/lib/budget-month';

describe('which month the screen is showing', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('takes the month written in the address', () => {
    expect(monthFromUrl('2026-09', '2026-08')).toBe('2026-09');
  });

  it('falls back when the address carries no month, or one nobody could have written', () => {
    for (const raw of [null, '', '2026-13', '2026-1', 'сентябрь', '2026-09-01']) {
      expect(monthFromUrl(raw, '2026-08')).toBe('2026-08');
    }
  });

  it('refuses a month earlier than the budget itself, because nothing happened there', () => {
    expect(monthFromUrl('2026-05', '2026-08', '2026-06')).toBe('2026-06');
    expect(monthFromUrl('2025-12', '2026-08', '2026-06')).toBe('2026-06');
    expect(monthFromUrl('2026-06', '2026-08', '2026-06')).toBe('2026-06');
    expect(monthFromUrl('2026-07', '2026-08', '2026-06')).toBe('2026-07');
  });

  it('reads today in the budget timezone rather than on the host clock', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T23:30:00Z'));

    expect(monthNow('Pacific/Kiritimati')).toBe('2026-09');
    expect(monthNow('America/New_York')).toBe('2026-08');
    expect(monthNow('UTC')).toBe('2026-08');
  });

  it('names the month in the language the screen is being read in', () => {
    expect(monthLabel('2026-08', 'ru')).toMatch(/2026/);
    expect(monthLabel('2026-08', 'ru')).not.toMatch(/August/);
    expect(monthLabel('2026-08', 'en')).toMatch(/August/);
    expect(monthLabel('2026-08', 'pl')).not.toMatch(/August/);
  });
});

describe('the ring a category is drawn with', () => {
  it('is empty when nothing went out of the envelope this month', () => {
    expect(spendRing(0n, 60000n)).toMatchObject({ fraction: 0, overspent: false, moved: 0n });
  });

  it('fills by the share of the envelope that was spent', () => {
    expect(spendRing(-148600n, 76600n).fraction).toBeCloseTo(148600 / 225200, 5);
  });

  it('is full when the envelope was spent to nothing', () => {
    expect(spendRing(-30000n, 0n)).toMatchObject({ fraction: 1, overspent: false });
  });

  it('is full and marked over when more went out than was in it', () => {
    expect(spendRing(-37200n, -7200n)).toMatchObject({ fraction: 1, overspent: true });
  });

  it('is full rather than dividing by zero when the envelope was empty and money still went out', () => {
    expect(spendRing(-5000n, -5000n)).toMatchObject({ fraction: 1, overspent: true });
    expect(spendRing(0n, 0n)).toMatchObject({ fraction: 0, overspent: false });
  });

  it('says money came in rather than went out when the month is positive', () => {
    expect(spendRing(4500n, 64500n)).toMatchObject({
      incoming: true,
      moved: 4500n,
      fraction: 0,
    });
    expect(spendRing(-4500n, 55500n)).toMatchObject({ incoming: false, moved: 4500n });
    expect(spendRing(0n, 1000n).incoming).toBe(false);
  });

  it('never fills past full, whatever the overspend', () => {
    expect(spendRing(-1000000n, -940000n).fraction).toBe(1);
  });
});
