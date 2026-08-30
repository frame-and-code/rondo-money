import { targetProgress, type ActiveTarget, type MonthSums } from '@/budget-view/target-progress';

const target = (over: Partial<ActiveTarget> = {}): ActiveTarget => ({
  kind: 'CONTRIBUTE',
  amount: 0n,
  startMonth: '2026-08',
  dueMonth: null,
  ...over,
});

const sums = (over: Partial<MonthSums> = {}): MonthSums => ({
  assigned: 0n,
  activity: 0n,
  available: 0n,
  fundedFromStart: 0n,
  assignedBeforeStart: 0n,
  activityBeforeStart: 0n,
  ...over,
});

describe('a goal that refills the envelope to an amount', () => {
  it('asks only for the gap the carried remainder does not cover', () => {
    const answer = targetProgress(
      target({ kind: 'REFILL_TO', amount: 55_000n }),
      '2026-08',
      sums({ assigned: 43_000n, activity: -21_000n, available: 27_000n }),
    );

    expect(answer.monthTarget).toBe(50_000n);
    expect(answer.needed).toBe(7_000n);
    expect(answer.progress).toBe(48_000n);
    expect(answer.remaining).toBe(7_000n);
  });
});

describe('a goal that puts an amount in every month', () => {
  it('asks for the whole amount however much carried over', () => {
    const answer = targetProgress(
      target({ kind: 'CONTRIBUTE', amount: 40_000n }),
      '2026-08',
      sums({ assigned: 28_000n, available: 68_000n }),
    );

    expect(answer.monthTarget).toBe(40_000n);
    expect(answer.needed).toBe(12_000n);
    expect(answer.progress).toBe(28_000n);
    expect(answer.remaining).toBe(12_000n);
  });
});

describe('spending in the month that is being read', () => {
  const KINDS: ActiveTarget[] = [
    target({ kind: 'REFILL_TO', amount: 55_000n }),
    target({ kind: 'CONTRIBUTE', amount: 40_000n }),
    target({
      kind: 'BY_DATE',
      amount: 100_000n,
      startMonth: '2026-07',
      dueMonth: '2026-10',
    }),
    target({ kind: 'ACCUMULATE', amount: 300_000n, startMonth: '2026-07' }),
  ];

  it.each(KINDS)('does not reopen a $kind goal', (one) => {
    const dry = sums({ assigned: 43_000n, available: 48_000n, fundedFromStart: 43_000n });
    const spent = sums({
      assigned: 43_000n,
      activity: -21_000n,
      available: 27_000n,
      fundedFromStart: 43_000n,
    });

    expect(targetProgress(one, '2026-08', spent).needed).toBe(
      targetProgress(one, '2026-08', dry).needed,
    );
    expect(targetProgress(one, '2026-08', spent).monthTarget).toBe(
      targetProgress(one, '2026-08', dry).monthTarget,
    );
  });
});

describe('a goal that saves an amount by a month', () => {
  const wakacje = target({
    kind: 'BY_DATE',
    amount: 100_000n,
    startMonth: '2026-07',
    dueMonth: '2026-10',
  });

  it('divides what is left by the months that are still open, rounding down', () => {
    const answer = targetProgress(
      wakacje,
      '2026-08',
      sums({ assigned: 20_000n, available: 40_000n, fundedFromStart: 40_000n }),
    );

    expect(answer.monthTarget).toBe(26_666n);
    expect(answer.needed).toBe(6_666n);
    expect(answer.progress).toBe(40_000n);
    expect(answer.remaining).toBe(60_000n);
  });

  it('asks for the whole remainder in the month it is due', () => {
    const answer = targetProgress(
      wakacje,
      '2026-10',
      sums({ available: 40_000n, fundedFromStart: 40_000n }),
    );

    expect(answer.monthTarget).toBe(60_000n);
    expect(answer.needed).toBe(60_000n);
  });

  it('raises the next instalment when a month was skipped', () => {
    const answer = targetProgress(
      wakacje,
      '2026-09',
      sums({ available: 40_000n, fundedFromStart: 40_000n }),
    );

    expect(answer.monthTarget).toBe(30_000n);
    expect(answer.needed).toBe(30_000n);
  });

  it('keeps the same arithmetic in a month past the one being lived in', () => {
    const answer = targetProgress(
      target({
        kind: 'BY_DATE',
        amount: 100_000n,
        startMonth: '2026-07',
        dueMonth: '2027-06',
      }),
      '2027-01',
      sums({ available: 40_000n, fundedFromStart: 40_000n }),
    );

    expect(answer.monthTarget).toBe(10_000n);
    expect(answer.needed).toBe(10_000n);
  });
});

describe('a goal that saves an amount with no date', () => {
  it('asks for nothing monthly and answers with the progress and what is left', () => {
    const answer = targetProgress(
      target({
        kind: 'ACCUMULATE',
        amount: 300_000n,
        startMonth: '2026-07',
      }),
      '2026-08',
      sums({
        assigned: 10_000n,
        activity: -30_000n,
        available: 140_000n,
        fundedFromStart: 20_000n,
        assignedBeforeStart: 200_000n,
        activityBeforeStart: -50_000n,
      }),
    );

    expect(answer.monthTarget).toBeNull();
    expect(answer.needed).toBeNull();
    expect(answer.progress).toBe(170_000n);
    expect(answer.remaining).toBe(130_000n);
  });
});

describe('what the envelope carried in when a saving goal started', () => {
  const remont = target({
    kind: 'BY_DATE',
    amount: 10_000n,
    startMonth: '2026-08',
    dueMonth: '2026-12',
  });

  it('counts as money laid in the month the goal started', () => {
    const answer = targetProgress(
      remont,
      '2026-08',
      sums({ available: 3_000n, assignedBeforeStart: 3_000n }),
    );

    expect(answer.monthTarget).toBe(2_000n);
    expect(answer.needed).toBe(0n);
    expect(answer.progress).toBe(3_000n);
  });

  it('lowers the first instalment when it does not cover it', () => {
    const answer = targetProgress(
      remont,
      '2026-08',
      sums({ available: 1_500n, assignedBeforeStart: 1_500n }),
    );

    expect(answer.monthTarget).toBe(2_000n);
    expect(answer.needed).toBe(500n);
  });

  it('starts the progress below zero when the envelope was in the red', () => {
    const answer = targetProgress(
      remont,
      '2026-08',
      sums({ available: -2_000n, assignedBeforeStart: 3_000n, activityBeforeStart: -5_000n }),
    );

    expect(answer.progress).toBe(-2_000n);
    expect(answer.monthTarget).toBe(2_000n);
    expect(answer.needed).toBe(4_000n);
  });
});

describe('a goal that was given more than it asked for', () => {
  it('asks for nothing rather than for a negative amount', () => {
    const answer = targetProgress(
      target({ kind: 'CONTRIBUTE', amount: 8_000n }),
      '2026-08',
      sums({ assigned: 12_000n, activity: -12_300n, available: -300n }),
    );

    expect(answer.needed).toBe(0n);
    expect(answer.remaining).toBe(0n);
  });
});

describe('a month whose assignments were taken back out', () => {
  it('asks for more, and still never for a negative amount', () => {
    const answer = targetProgress(
      target({ kind: 'CONTRIBUTE', amount: 40_000n }),
      '2026-08',
      sums({ assigned: -5_000n, available: -5_000n }),
    );

    expect(answer.monthTarget).toBe(40_000n);
    expect(answer.needed).toBe(45_000n);
    expect(answer.progress).toBe(-5_000n);
    expect(answer.remaining).toBe(45_000n);
  });
});
