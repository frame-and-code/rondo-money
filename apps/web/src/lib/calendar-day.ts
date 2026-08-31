import { parseCalendarDate } from '@rondo/types';

export function dayOf(date: string): Date {
  const [year = '', month = '', day = ''] = date.split('-');

  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function dateOf(picked: Date): string {
  const year = picked.getFullYear();
  const month = String(picked.getMonth() + 1).padStart(2, '0');
  const day = String(picked.getDate()).padStart(2, '0');

  return parseCalendarDate(`${year}-${month}-${day}`);
}
