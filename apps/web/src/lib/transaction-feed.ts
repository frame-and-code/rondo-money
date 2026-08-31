import { type TransactionDayDto, type TransactionDto } from '@rondo/types';

export type FeedRecord = TransactionDto;

export type DayName = 'today' | 'yesterday' | null;

export interface FeedDay {
  date: string;
  name: DayName;
  total: string;
  records: FeedRecord[];
}

const DAY_MS = 86_400_000;

function nameOf(date: string, today: string): DayName {
  if (date === today) {
    return 'today';
  }

  const before = new Date(new Date(`${today}T00:00:00Z`).getTime() - DAY_MS)
    .toISOString()
    .slice(0, 10);

  return date === before ? 'yesterday' : null;
}

export function feedDays(
  records: FeedRecord[],
  totals: TransactionDayDto[],
  today: string,
): FeedDay[] {
  const days: FeedDay[] = [];

  for (const record of records) {
    const open = days.at(-1);

    if (open?.date === record.date) {
      open.records.push(record);
      continue;
    }

    days.push({
      date: record.date,
      name: nameOf(record.date, today),
      total: totals.find((day) => day.date === record.date)?.total ?? '0',
      records: [record],
    });
  }

  return days;
}
