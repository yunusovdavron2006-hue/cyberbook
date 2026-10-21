import {
  isoDateInTz,
  nextLocalDate,
  openWindowsForLocalDate,
  parseHhMm,
  parseIsoDate,
  previousLocalDate,
  tzOffsetMs,
  utcToZonedParts,
  weekdayOfLocalDate,
  zonedTimeToUtc,
} from './time.util';

const TASHKENT = 'Asia/Tashkent'; // UTC+5, no DST

describe('time.util', () => {
  describe('tzOffsetMs', () => {
    it('knows Asia/Tashkent is UTC+5', () => {
      expect(tzOffsetMs(TASHKENT, new Date('2026-06-01T00:00:00.000Z'))).toBe(5 * 3600 * 1000);
      expect(tzOffsetMs(TASHKENT, new Date('2026-01-01T00:00:00.000Z'))).toBe(5 * 3600 * 1000);
    });
  });

  describe('zonedTimeToUtc', () => {
    it('converts 12:00 local to 07:00Z', () => {
      const utc = zonedTimeToUtc(TASHKENT, { year: 2026, month: 1, day: 15 }, 12, 0);
      expect(utc.toISOString()).toBe('2026-01-15T07:00:00.000Z');
    });

    it('converts 00:30 local to previous-day 19:30Z', () => {
      const utc = zonedTimeToUtc(TASHKENT, { year: 2026, month: 3, day: 10 }, 0, 30);
      expect(utc.toISOString()).toBe('2026-03-09T19:30:00.000Z');
    });
  });

  describe('utcToZonedParts', () => {
    it('extracts local wall-clock parts', () => {
      const p = utcToZonedParts(TASHKENT, new Date('2026-01-15T07:00:00.000Z'));
      expect(p).toMatchObject({ year: 2026, month: 1, day: 15, hours: 12, minutes: 0 });
    });
  });

  describe('isoDateInTz', () => {
    it('rolls to the correct local day', () => {
      // 19:30Z on Mar 9 is 00:30 on Mar 10 in Tashkent
      expect(isoDateInTz(TASHKENT, new Date('2026-03-09T19:30:00.000Z'))).toBe('2026-03-10');
    });
  });

  describe('parseHhMm / isValidHhMm', () => {
    it('parses valid times', () => {
      expect(parseHhMm('09:30')).toEqual({ hours: 9, minutes: 30 });
      expect(parseHhMm('23:59')).toEqual({ hours: 23, minutes: 59 });
    });
    it('throws on invalid times', () => {
      expect(() => parseHhMm('24:00')).toThrow();
      expect(() => parseHhMm('9:5')).toThrow();
      expect(() => parseHhMm('noon')).toThrow();
    });
  });

  describe('openWindowsForLocalDate', () => {
    it('returns [] for closed days', () => {
      expect(
        openWindowsForLocalDate(TASHKENT, { year: 2026, month: 1, day: 1 }, {
          closed: true,
          opensAt: '10:00',
          closesAt: '22:00',
        }),
      ).toEqual([]);
    });

    it('produces a same-day window for daytime hours', () => {
      const windows = openWindowsForLocalDate(TASHKENT, { year: 2026, month: 1, day: 15 }, {
        closed: false,
        opensAt: '10:00',
        closesAt: '22:00',
      });
      expect(windows).toHaveLength(1);
      expect(windows[0].startsAt.toISOString()).toBe('2026-01-15T05:00:00.000Z');
      expect(windows[0].endsAt.toISOString()).toBe('2026-01-15T17:00:00.000Z');
    });

    it('extends overnight shifts to the next local day', () => {
      const windows = openWindowsForLocalDate(TASHKENT, { year: 2026, month: 1, day: 15 }, {
        closed: false,
        opensAt: '10:00',
        closesAt: '02:00',
      });
      expect(windows).toHaveLength(1);
      expect(windows[0].startsAt.toISOString()).toBe('2026-01-15T05:00:00.000Z');
      expect(windows[0].endsAt.toISOString()).toBe('2026-01-15T21:00:00.000Z');
    });
  });

  describe('date arithmetic', () => {
    it('nextLocalDate / previousLocalDate cross month boundaries', () => {
      expect(nextLocalDate({ year: 2026, month: 1, day: 31 })).toEqual({ year: 2026, month: 2, day: 1 });
      expect(previousLocalDate({ year: 2026, month: 3, day: 1 })).toEqual({ year: 2026, month: 2, day: 28 });
    });

    it('parseIsoDate validates format', () => {
      expect(parseIsoDate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
      expect(() => parseIsoDate('28-02-2026')).toThrow();
    });

    it('weekdayOfLocalDate: 0=Mon..6=Sun', () => {
      // 2026-01-05 is a Monday
      expect(weekdayOfLocalDate({ year: 2026, month: 1, day: 5 })).toBe(0);
      // 2026-01-11 is a Sunday
      expect(weekdayOfLocalDate({ year: 2026, month: 1, day: 11 })).toBe(6);
    });
  });
});
