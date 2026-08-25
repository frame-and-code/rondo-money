import {
  calendarDateIn,
  calendarDateOf,
  calendarMonthOf,
  isTimeZone,
  monthOf,
  parseCalendarDate,
  parseCalendarMonth,
  toDbDate,
  toDbMonth,
  todayIn,
} from '@rondo/types';

describe('calendarDateIn', () => {
  it('reads the date of the timezone it was given, not the host one', () => {
    const instant = new Date('2026-01-01T00:30:00Z');

    expect(calendarDateIn(instant, 'Europe/Warsaw')).toBe('2026-01-01');
    expect(calendarDateIn(instant, 'America/New_York')).toBe('2025-12-31');
  });

  it('pads month and day to two digits', () => {
    expect(calendarDateIn(new Date('2026-03-05T12:00:00Z'), 'UTC')).toBe('2026-03-05');
    expect(calendarDateIn(new Date('2026-01-09T12:00:00Z'), 'UTC')).toBe('2026-01-09');
  });

  it('refuses an instant that is not a point in time', () => {
    expect(() => calendarDateIn(new Date('not a date'), 'UTC')).toThrow(TypeError);
    expect(() => calendarDateIn(new Date('not a date'), 'UTC')).toThrow(/invalid Date/);
  });

  it('uses the offset in effect at that instant, so a DST change moves the date', () => {
    expect(calendarDateIn(new Date('2026-01-15T22:30:00Z'), 'Europe/Warsaw')).toBe('2026-01-15');
    expect(calendarDateIn(new Date('2026-07-15T22:30:00Z'), 'Europe/Warsaw')).toBe('2026-07-16');
  });

  it('rejects a timezone the runtime cannot resolve, naming it', () => {
    expect(() => calendarDateIn(new Date(), 'Nowhere/Nothing')).toThrow(TypeError);
    expect(() => calendarDateIn(new Date(), 'Nowhere/Nothing')).toThrow(/Nowhere\/Nothing/);
  });
});

describe('todayIn', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('answers for the current instant, in the timezone it was asked about', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:30:00Z'));

    expect(todayIn('Europe/Warsaw')).toBe('2026-01-01');
    expect(todayIn('America/New_York')).toBe('2025-12-31');
  });
});

describe('monthOf', () => {
  it('buckets a calendar date by year and month', () => {
    expect(monthOf('2026-01-31')).toBe('2026-01');
    expect(monthOf('2025-12-01')).toBe('2025-12');
  });

  it('refuses a date it cannot parse', () => {
    expect(() => monthOf('2026-13-01')).toThrow(TypeError);
  });
});

describe('parseCalendarDate', () => {
  it('accepts a well-formed calendar date', () => {
    expect(parseCalendarDate('2026-02-28')).toBe('2026-02-28');
    expect(parseCalendarDate('2024-02-29')).toBe('2024-02-29');
  });

  it('refuses a day the calendar does not have', () => {
    expect(() => parseCalendarDate('2026-02-30')).toThrow(TypeError);
    expect(() => parseCalendarDate('2026-13-01')).toThrow(TypeError);
    expect(() => parseCalendarDate('2025-02-29')).toThrow(TypeError);
  });

  it('refuses anything that is not YYYY-MM-DD', () => {
    expect(() => parseCalendarDate('2026-1-5')).toThrow(TypeError);
    expect(() => parseCalendarDate('')).toThrow(TypeError);
    expect(() => parseCalendarDate('not a date')).toThrow(TypeError);
    expect(() => parseCalendarDate('2026-03-05T12:00:00Z')).toThrow(TypeError);
  });

  it('names the offending value, so the failure is actionable without a debugger', () => {
    expect(() => parseCalendarDate('2026-02-30')).toThrow(/2026-02-30/);
  });
});

describe('isTimeZone', () => {
  it('accepts an IANA name the runtime knows', () => {
    expect(isTimeZone('Europe/Warsaw')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
  });

  it('rejects what it cannot resolve', () => {
    expect(isTimeZone('Nowhere/Nothing')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });

  it('rejects a fixed offset, which never follows a daylight-saving change', () => {
    expect(isTimeZone('+05:30')).toBe(false);
    expect(isTimeZone('+0530')).toBe(false);
    expect(isTimeZone('-07')).toBe(false);
  });

  it('rejects the fixed-offset zones that wear a name', () => {
    expect(isTimeZone('Etc/GMT+5')).toBe(false);
    expect(isTimeZone('EST')).toBe(false);
    expect(isTimeZone('GMT')).toBe(false);
    expect(isTimeZone('Zulu')).toBe(false);
    expect(isTimeZone('SystemV/EST5')).toBe(false);
  });

  it('keeps the region names a browser reports, and UTC by name', () => {
    expect(isTimeZone('America/New_York')).toBe(true);
    expect(isTimeZone('Australia/Lord_Howe')).toBe(true);
    expect(isTimeZone('US/Pacific')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
  });
});

describe('calendarDateOf', () => {
  it('reads the day a Postgres date column comes back as, in no timezone at all', () => {
    expect(calendarDateOf(new Date('2026-03-05T00:00:00Z'))).toBe('2026-03-05');
    expect(calendarDateOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('refuses a value that is not a point in time', () => {
    expect(() => calendarDateOf(new Date('not a date'))).toThrow(TypeError);
  });

  it('refuses an instant that carries a time, whose day depends on a zone', () => {
    expect(() => calendarDateOf(new Date('2026-03-05T23:30:00Z'))).toThrow(TypeError);
    expect(() => calendarDateOf(new Date('2026-03-05T23:30:00Z'))).toThrow(/carries a time/);
  });

  it('holds either side of the epoch, where a remainder turns negative', () => {
    expect(calendarDateOf(new Date('1969-12-31T00:00:00Z'))).toBe('1969-12-31');
    expect(() => calendarDateOf(new Date('1969-12-31T23:30:00Z'))).toThrow(/carries a time/);
  });
});

describe('toDbDate', () => {
  it('round-trips a calendar date through the shape the date column stores', () => {
    expect(toDbDate('2026-03-05').toISOString()).toBe('2026-03-05T00:00:00.000Z');
    expect(calendarDateOf(toDbDate('2025-12-31'))).toBe('2025-12-31');
  });

  it('refuses a value that is not a calendar date', () => {
    expect(() => toDbDate('2026-02-30')).toThrow(TypeError);
  });
});

describe('parseCalendarMonth', () => {
  it('accepts a month and hands it back', () => {
    expect(parseCalendarMonth('2026-02')).toBe('2026-02');
    expect(parseCalendarMonth('1969-12')).toBe('1969-12');
  });

  it('refuses a month number no month answers to', () => {
    expect(() => parseCalendarMonth('2026-00')).toThrow(TypeError);
    expect(() => parseCalendarMonth('2026-13')).toThrow(TypeError);
  });

  it('refuses anything that is not the year-month shape', () => {
    for (const value of ['2026-1', '2026-02-01', '2026', '', 'not a month', '26-02']) {
      expect(() => parseCalendarMonth(value)).toThrow(TypeError);
    }
  });

  it('names the value it refused, so the failure reads without a debugger', () => {
    expect(() => parseCalendarMonth('2026-13')).toThrow(/Invalid calendar month: "2026-13"/);
  });
});

describe('toDbMonth', () => {
  it('writes the first day of the month at midnight UTC, not in the host zone', () => {
    expect(toDbMonth('2026-02').toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(toDbMonth('2025-12').toISOString()).toBe('2025-12-01T00:00:00.000Z');
  });

  it('refuses a value that is not a month', () => {
    expect(() => toDbMonth('2026-13')).toThrow(TypeError);
  });
});

describe('calendarMonthOf', () => {
  it('reads back the month a stored first-of-month carries', () => {
    expect(calendarMonthOf(new Date('2026-02-01T00:00:00Z'))).toBe('2026-02');
  });

  it('refuses a value carrying a time, whose month depends on a zone it is not given', () => {
    expect(() => calendarMonthOf(new Date('2026-02-01T23:30:00Z'))).toThrow(TypeError);
    expect(() => calendarMonthOf(new Date('2026-02-01T23:30:00Z'))).toThrow(/carries a time/);
  });

  it('refuses a day that is not the first, rather than rounding to a month nobody wrote', () => {
    expect(() => calendarMonthOf(new Date('2026-02-05T00:00:00Z'))).toThrow(TypeError);
    expect(() => calendarMonthOf(new Date('2026-02-05T00:00:00Z'))).toThrow(/first day/);
  });

  it('refuses an instant that is not a point in time', () => {
    expect(() => calendarMonthOf(new Date('not a date'))).toThrow(TypeError);
  });

  it('round-trips across the year boundary and before the epoch', () => {
    for (const month of ['2025-12', '2026-01', '1969-12', '1970-01']) {
      expect(calendarMonthOf(toDbMonth(month))).toBe(month);
    }
  });
});
