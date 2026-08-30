import { monthsInclusive, type CalendarMonth, type TargetKind } from '@rondo/types';

export interface ActiveTarget {
  kind: TargetKind;
  amount: bigint;
  startMonth: CalendarMonth;
  dueMonth: CalendarMonth | null;
}

export interface MonthSums {
  assigned: bigint;
  activity: bigint;
  available: bigint;
  fundedFromStart: bigint;
  assignedBeforeStart: bigint;
  activityBeforeStart: bigint;
}

export interface TargetProgress {
  monthTarget: bigint | null;
  needed: bigint | null;
  progress: bigint;
  remaining: bigint;
}

function atLeastZero(amount: bigint): bigint {
  return amount > 0n ? amount : 0n;
}

export function targetProgress(
  target: ActiveTarget,
  month: CalendarMonth,
  sums: MonthSums,
): TargetProgress {
  const carryover = sums.available - sums.assigned - sums.activity;
  const carriedInAtStart = sums.assignedBeforeStart + sums.activityBeforeStart;
  const laid = sums.assigned + (month === target.startMonth ? carriedInAtStart : 0n);

  if (target.kind === 'REFILL_TO') {
    const monthTarget = atLeastZero(target.amount - carryover);
    const progress = carryover + sums.assigned;

    return {
      monthTarget,
      needed: atLeastZero(monthTarget - sums.assigned),
      progress,
      remaining: atLeastZero(target.amount - progress),
    };
  }

  if (target.kind === 'CONTRIBUTE') {
    return {
      monthTarget: target.amount,
      needed: atLeastZero(target.amount - sums.assigned),
      progress: sums.assigned,
      remaining: atLeastZero(target.amount - sums.assigned),
    };
  }

  const progress = carriedInAtStart + sums.fundedFromStart;
  const remaining = atLeastZero(target.amount - progress);

  if (target.kind === 'ACCUMULATE') {
    return { monthTarget: null, needed: null, progress, remaining };
  }

  if (target.dueMonth === null) {
    throw new Error(
      'A goal saving by a date carries no due month, so there is nothing to divide its ' +
        'remainder by',
    );
  }

  const monthTarget =
    atLeastZero(target.amount - (progress - laid)) /
    BigInt(monthsInclusive(month, target.dueMonth));

  return { monthTarget, needed: atLeastZero(monthTarget - laid), progress, remaining };
}
