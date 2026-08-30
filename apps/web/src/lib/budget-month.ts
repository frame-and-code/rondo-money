import {
  monthOf,
  parseCalendarMonth,
  parseMoney,
  todayIn,
  type BudgetViewCategoryDto,
  type CalendarMonth,
} from '@rondo/types';
import { format } from 'date-fns';

import { calendarLocale } from '@/lib/calendar-locale';

export interface CategoryRing {
  fill: number;
  head: number;
  goalShare: number | null;
  overspent: boolean;
  incoming: boolean;
  moved: bigint;
}

export type RingSource = Pick<
  BudgetViewCategoryDto,
  'assigned' | 'activity' | 'available' | 'target'
>;

function wholeGoalShare(target: BudgetViewCategoryDto['target'] | undefined): number | null {
  if (
    target === null ||
    target === undefined ||
    (target.kind !== 'BY_DATE' && target.kind !== 'ACCUMULATE')
  ) {
    return null;
  }

  const amount = parseMoney(target.amount);
  const progress = parseMoney(target.progress);

  if (amount <= 0n || progress <= 0n) {
    return 0;
  }

  return Math.min(1, Number(progress) / Number(amount));
}

export function categoryRing(category: RingSource): CategoryRing {
  const activity = parseMoney(category.activity);
  const available = parseMoney(category.available);
  const spent = activity < 0n ? -activity : 0n;

  const shared = {
    goalShare: wholeGoalShare(category.target),
    overspent: available < 0n,
    incoming: activity > 0n,
    moved: activity < 0n ? -activity : activity,
  };

  const monthTarget =
    category.target?.monthTarget === undefined ? null : parseMoney(category.target.monthTarget);
  const needed = category.target?.needed === undefined ? null : parseMoney(category.target.needed);

  if (monthTarget !== null && needed !== null && monthTarget > 0n) {
    const fill = Math.min(1, Math.max(0, Number(monthTarget - needed) / Number(monthTarget)));

    return { ...shared, fill, head: Math.min(Number(spent) / Number(monthTarget), fill) };
  }

  const held = available - activity;

  if (held > 0n) {
    return { ...shared, fill: 1, head: Math.min(Number(spent) / Number(held), 1) };
  }

  const fill = spent > 0n ? 1 : 0;

  return { ...shared, fill, head: fill };
}

export function monthNow(timezone: string): CalendarMonth {
  return monthOf(todayIn(timezone));
}

export function monthFromUrl(
  raw: string | null,
  fallback: CalendarMonth,
  first?: CalendarMonth,
): CalendarMonth {
  if (raw === null) {
    return fallback;
  }

  try {
    const asked = parseCalendarMonth(raw);

    return first !== undefined && asked < first ? first : asked;
  } catch {
    return fallback;
  }
}

export function monthLabel(month: CalendarMonth, locale: string): string {
  const [year = '', index = ''] = parseCalendarMonth(month).split('-');

  return format(new Date(Number(year), Number(index) - 1, 1), 'LLLL yyyy', {
    locale: calendarLocale(locale),
  });
}
