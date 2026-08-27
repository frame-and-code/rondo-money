import { monthOf, parseCalendarMonth, todayIn, type CalendarMonth } from '@rondo/types';

export interface SpendRing {
  fraction: number;
  overspent: boolean;
  incoming: boolean;
  moved: bigint;
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

  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${year}-${index}-01T00:00:00Z`));
}

export function spendRing(activity: bigint, available: bigint): SpendRing {
  const incoming = activity > 0n;
  const moved = activity < 0n ? -activity : activity;
  const spent = activity < 0n ? -activity : 0n;
  const held = available - activity;

  const fraction = held > 0n ? Math.min(1, Number(spent) / Number(held)) : spent > 0n ? 1 : 0;

  return { fraction, overspent: available < 0n, incoming, moved };
}
