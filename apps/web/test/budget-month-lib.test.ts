import type { BudgetViewTargetDto, TargetKind } from '@rondo/types';

import {
  categoryRing,
  monthFromUrl,
  monthLabel,
  monthNow,
  type RingSource,
} from '@/lib/budget-month';

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

const envelope = (
  assigned: number,
  activity: number,
  available: number,
  target: BudgetViewTargetDto | null = null,
): RingSource => ({
  assigned: String(assigned),
  activity: String(activity),
  available: String(available),
  target,
});

const goal = (
  kind: TargetKind,
  amount: number,
  progress: number,
  monthly: { monthTarget: number; needed: number } | null,
): BudgetViewTargetDto => ({
  kind,
  amount: String(amount),
  startMonth: '2026-07',
  progress: String(progress),
  remaining: String(Math.max(0, amount - progress)),
  ...(kind === 'BY_DATE' ? { dueMonth: '2026-10' as const } : {}),
  ...(monthly === null
    ? {}
    : { monthTarget: String(monthly.monthTarget), needed: String(monthly.needed) }),
});

describe('the ring a category is drawn with', () => {
  it('measures the month against what the goal asks, not against the envelope', () => {
    const ring = categoryRing(
      envelope(
        20000,
        0,
        40000,
        goal('BY_DATE', 100000, 40000, { monthTarget: 26666, needed: 6666 }),
      ),
    );

    expect(ring.fill).toBeCloseTo(20000 / 26666, 5);
    expect(ring.head).toBe(0);
  });

  it('runs the spent head over the same denominator the goal set', () => {
    const ring = categoryRing(
      envelope(
        40000,
        -21600,
        18400,
        goal('CONTRIBUTE', 40000, 40000, { monthTarget: 40000, needed: 0 }),
      ),
    );

    expect(ring.fill).toBe(1);
    expect(ring.head).toBeCloseTo(21600 / 40000, 5);
  });

  it('never lets the head outgrow the arc, so it cannot eat what is still missing', () => {
    const ring = categoryRing(
      envelope(
        1000,
        -5000,
        6000,
        goal('CONTRIBUTE', 10000, 1000, { monthTarget: 10000, needed: 9000 }),
      ),
    );

    expect(ring.head).toBeCloseTo(0.1, 5);
    expect(ring.head).toBeLessThanOrEqual(ring.fill);
    expect(ring.fill).toBeLessThanOrEqual(1);
  });

  it('stays empty rather than negative when more was taken out than the goal asked for', () => {
    const ring = categoryRing(
      envelope(
        -5000,
        0,
        15000,
        goal('REFILL_TO', 30000, 15000, { monthTarget: 10000, needed: 15000 }),
      ),
    );

    expect(ring.fill).toBe(0);
    expect(ring.head).toBe(0);
  });

  it('measures the envelope when the goal asks for nothing this month', () => {
    const ring = categoryRing(
      envelope(0, 0, 30000, goal('REFILL_TO', 30000, 30000, { monthTarget: 0, needed: 0 })),
    );

    expect(ring.fill).toBe(1);
    expect(ring.head).toBe(0);
  });

  it('measures the envelope for a goal that asks for no month at all', () => {
    const ring = categoryRing(envelope(3000, 0, 12000, goal('ACCUMULATE', 50000, 12000, null)));

    expect(ring.fill).toBe(1);
    expect(ring.head).toBe(0);
    expect(ring.goalShare).toBeCloseTo(12000 / 50000, 5);
  });

  it('splits the envelope into spent and left when there is no goal', () => {
    const ring = categoryRing(envelope(12000, -13400, 800));

    expect(ring.fill).toBe(1);
    expect(ring.head).toBeCloseTo(13400 / 14200, 5);
    expect(ring.goalShare).toBeNull();
  });

  it('carries the whole goal only for the two kinds that have one', () => {
    expect(
      categoryRing(
        envelope(
          20000,
          0,
          40000,
          goal('BY_DATE', 100000, 40000, { monthTarget: 26666, needed: 6666 }),
        ),
      ).goalShare,
    ).toBeCloseTo(0.4, 5);
    expect(
      categoryRing(
        envelope(0, 0, 30000, goal('REFILL_TO', 30000, 30000, { monthTarget: 0, needed: 0 })),
      ).goalShare,
    ).toBeNull();
    expect(
      categoryRing(
        envelope(
          40000,
          0,
          40000,
          goal('CONTRIBUTE', 40000, 40000, { monthTarget: 40000, needed: 0 }),
        ),
      ).goalShare,
    ).toBeNull();
  });

  it('leaves the whole goal empty rather than negative when the envelope was raided', () => {
    const ring = categoryRing(envelope(20000, 0, -5200, goal('ACCUMULATE', 50000, -5200, null)));

    expect(ring.goalShare).toBe(0);
  });

  it('is empty when nothing went in or out this month', () => {
    expect(categoryRing(envelope(0, 0, 0))).toMatchObject({ fill: 0, head: 0, overspent: false });
  });

  it('is wholly filled and marked over when more went out than was in it', () => {
    expect(categoryRing(envelope(10000, -12000, -2000))).toMatchObject({
      fill: 1,
      head: 1,
      overspent: true,
    });
  });

  it('fills rather than dividing by zero when the envelope was empty and money still went out', () => {
    expect(categoryRing(envelope(0, -5000, -5000))).toMatchObject({
      fill: 1,
      head: 1,
      overspent: true,
    });
  });

  it('says money came in rather than went out when the month is positive', () => {
    expect(categoryRing(envelope(60000, 4500, 64500))).toMatchObject({
      incoming: true,
      moved: 4500n,
      head: 0,
    });
    expect(categoryRing(envelope(60000, -4500, 55500))).toMatchObject({
      incoming: false,
      moved: 4500n,
    });
    expect(categoryRing(envelope(1000, 0, 1000)).incoming).toBe(false);
  });
});
