import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  nextLocalDate,
  openWindowsForLocalDate,
  OpenWindow,
  parseIsoDate,
  previousLocalDate,
  weekdayOfLocalDate,
  ZonedDateParts,
} from '../utils/time.util';

/**
 * Computes a club's open windows (UTC) for a local date, honoring:
 *  - weekly operating hours (including overnight shifts)
 *  - special closures (full-day)
 *
 * A shift that starts on the previous local day and crosses midnight is
 * included because it still occupies early hours of the requested date.
 */
@Injectable()
export class ClubScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async openWindowsForDate(
    clubId: number,
    timezone: string,
    date: ZonedDateParts,
  ): Promise<OpenWindow[]> {
    const [hours, closures] = await this.prisma.$transaction([
      this.prisma.operatingHours.findMany({ where: { clubId } }),
      this.prisma.specialClosure.findMany({
        where: {
          clubId,
          date: {
            in: [this.toUtcDate(date), this.toUtcDate(nextLocalDate(date)), this.toUtcDate(previousLocalDate(date))],
          },
        },
      }),
    ]);

    const closedDates = new Set(closures.map((c) => c.date.toISOString().slice(0, 10)));
    const hoursByDay = new Map(hours.map((h) => [h.dayOfWeek, h]));

    const isClosedOn = (d: ZonedDateParts) => closedDates.has(this.isoDate(d));

    // Window for the requested date (only if that date itself is open).
    const windows: OpenWindow[] = [];
    if (!isClosedOn(date)) {
      const day = hoursByDay.get(weekdayOfLocalDate(date)) ?? null;
      for (const w of openWindowsForLocalDate(timezone, date, day)) {
        windows.push(w);
      }
    }

    // Overnight spill-over from the previous local day.
    const prev = previousLocalDate(date);
    if (!isClosedOn(prev)) {
      const prevDay = hoursByDay.get(weekdayOfLocalDate(prev)) ?? null;
      if (prevDay && !prevDay.closed && prevDay.opensAt && prevDay.closesAt) {
        const prevWindows = openWindowsForLocalDate(timezone, prev, prevDay);
        const dateStart = this.utcMidnight(timezone, date);
        for (const w of prevWindows) {
          if (w.endsAt > dateStart && (prevDay.closesAt <= prevDay.opensAt)) {
            // Only the part of the overnight shift that actually falls on the
            // requested date (its early-morning tail) is relevant here.
            windows.push({
              startsAt: w.startsAt < dateStart ? dateStart : w.startsAt,
              endsAt: w.endsAt,
            });
          }
        }
      }
    }

    // Drop empty windows and sort.
    return windows
      .filter((w) => w.endsAt > w.startsAt)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  /** Whether [startsAt, endsAt) is fully contained within a single open window. */
  async isWithinOpenWindow(
    clubId: number,
    timezone: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<boolean> {
    const date = this.localDateOf(timezone, startsAt);
    const candidateDates = [previousLocalDate(date), date];
    for (const d of candidateDates) {
      const windows = await this.openWindowsForDate(clubId, timezone, d);
      for (const w of windows) {
        if (startsAt >= w.startsAt && endsAt <= w.endsAt) return true;
      }
    }
    return false;
  }

  private localDateOf(timezone: string, instant: Date): ZonedDateParts {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  private utcMidnight(timezone: string, date: ZonedDateParts): Date {
    const windows = openWindowsForLocalDate(timezone, date, {
      closed: false,
      opensAt: '00:00',
      closesAt: '00:00',
    });
    return windows[0].startsAt;
  }

  private toUtcDate(date: ZonedDateParts): Date {
    return new Date(Date.UTC(date.year, date.month - 1, date.day));
  }

  private isoDate(date: ZonedDateParts): string {
    return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  }

  static parse(iso: string) {
    return parseIsoDate(iso);
  }
}
