/**
 * Timezone-aware time utilities.
 *
 * Booking instants are stored as UTC timestamptz. Club operating hours are
 * wall-clock "HH:mm" strings interpreted in the club's IANA timezone
 * (default Asia/Tashkent). These helpers convert between the two using only
 * the Intl API — no external timezone dependency.
 */

export interface ZonedDateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Offset (ms) of `timeZone` relative to UTC at the given instant. */
export function tzOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - instant.getTime();
}

/** Convert a wall-clock "HH:mm" on a local date in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(
  timeZone: string,
  localDate: ZonedDateParts,
  hours: number,
  minutes: number,
): Date {
  const naiveUtc = Date.UTC(localDate.year, localDate.month - 1, localDate.day, hours, minutes, 0, 0);
  const offset1 = tzOffsetMs(timeZone, new Date(naiveUtc));
  const candidate = naiveUtc - offset1;
  const offset2 = tzOffsetMs(timeZone, new Date(candidate));
  if (offset1 !== offset2) {
    return new Date(naiveUtc - offset2);
  }
  return new Date(candidate);
}

/** Convert a UTC instant to wall-clock parts in `timeZone`. */
export function utcToZonedParts(timeZone: string, instant: Date): ZonedDateParts & {
  hours: number;
  minutes: number;
  weekday: number; // 0 = Monday … 6 = Sunday
} {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hours: Number(get('hour')) % 24,
    minutes: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

/** Parse "HH:mm" into { hours, minutes }. Throws on invalid input. */
export function parseHhMm(value: string): { hours: number; minutes: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid time "${value}", expected HH:mm`);
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function isValidHhMm(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());
}

/** ISO date (yyyy-mm-dd) of a UTC instant in a timezone. */
export function isoDateInTz(timeZone: string, instant: Date): string {
  const p = utcToZonedParts(timeZone, instant);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Parse yyyy-mm-dd into parts. */
export function parseIsoDate(value: string): ZonedDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid date "${value}", expected yyyy-mm-dd`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export interface OpenWindow {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Compute UTC open windows for a club on a given local date.
 * Overnight shifts (closesAt <= opensAt) produce two windows:
 * one ending at local midnight and one starting at the next local midnight.
 */
export function openWindowsForLocalDate(
  timeZone: string,
  localDate: ZonedDateParts,
  dayHours: { closed: boolean; opensAt: string | null; closesAt: string | null } | null,
): OpenWindow[] {
  if (!dayHours || dayHours.closed || !dayHours.opensAt || !dayHours.closesAt) {
    return [];
  }
  const opens = parseHhMm(dayHours.opensAt);
  const closes = parseHhMm(dayHours.closesAt);
  const opensAt = zonedTimeToUtc(timeZone, localDate, opens.hours, opens.minutes);

  if (closes.hours > opens.hours || (closes.hours === opens.hours && closes.minutes > opens.minutes)) {
    const endsAt = zonedTimeToUtc(timeZone, localDate, closes.hours, closes.minutes);
    return [{ startsAt: opensAt, endsAt }];
  }

  // Overnight: ends on the next local day.
  const next = nextLocalDate(localDate);
  const endsAt = zonedTimeToUtc(timeZone, next, closes.hours, closes.minutes);
  return [{ startsAt: opensAt, endsAt }];
}

export function nextLocalDate(date: ZonedDateParts): ZonedDateParts {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() + 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function previousLocalDate(date: ZonedDateParts): ZonedDateParts {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  d.setUTCDate(d.getUTCDate() - 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Weekday (0=Mon..6=Sun) of a local date using UTC arithmetic (calendar is tz-independent). */
export function weekdayOfLocalDate(date: ZonedDateParts): number {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const jsDay = d.getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7; // 0=Mon..6=Sun
}
