export type CalendarDate = string;

export type CalendarMonth = string;

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

const FIXED_OFFSET = /^[+-]/;

const OFFSET_NAMESPACE = /^(Etc|SystemV)\//i;

const DAY_MS = 86_400_000;

const ISO_ORDER: Intl.DateTimeFormatOptions = {
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

export function isTimeZone(value: string): boolean {
  const named = value.includes('/') && !FIXED_OFFSET.test(value) && !OFFSET_NAMESPACE.test(value);
  if (!named && value !== 'UTC') {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function requireInstant(instant: Date): number {
  const time = instant.getTime();
  if (Number.isNaN(time)) {
    throw new TypeError('Cannot read a calendar date from an invalid Date');
  }

  return time;
}

export function parseCalendarDate(value: string): CalendarDate {
  const instant = new Date(`${value}T00:00:00Z`);
  if (
    !CALENDAR_DATE.test(value) ||
    Number.isNaN(instant.getTime()) ||
    !instant.toISOString().startsWith(value)
  ) {
    throw new TypeError(`Invalid calendar date: ${JSON.stringify(value)}`);
  }

  return value;
}

export function calendarDateIn(instant: Date, timeZone: string): CalendarDate {
  if (!isTimeZone(timeZone)) {
    throw new TypeError(`Unknown time zone: ${JSON.stringify(timeZone)}`);
  }

  return parseCalendarDate(
    new Intl.DateTimeFormat('en-CA', { ...ISO_ORDER, timeZone }).format(requireInstant(instant)),
  );
}

export function calendarDateOf(stored: Date): CalendarDate {
  const time = requireInstant(stored);
  if (time % DAY_MS !== 0) {
    throw new TypeError(
      `Not a stored calendar date: ${stored.toISOString()} carries a time, so the day it ` +
        'falls on depends on a timezone this function is not given',
    );
  }

  return parseCalendarDate(new Date(time).toISOString().slice(0, 10));
}

export function toDbDate(date: CalendarDate): Date {
  return new Date(`${parseCalendarDate(date)}T00:00:00Z`);
}

export function todayIn(timeZone: string): CalendarDate {
  return calendarDateIn(new Date(), timeZone);
}

export function monthOf(date: CalendarDate): CalendarMonth {
  return parseCalendarDate(date).slice(0, 7);
}
