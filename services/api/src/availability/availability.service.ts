import { Injectable } from '@nestjs/common';
import { BookingStatus, ClubStatus, StationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '../common/exceptions';
import {
  isoDateInTz,
  nextLocalDate,
  openWindowsForLocalDate,
  OpenWindow,
  parseIsoDate,
  previousLocalDate,
  weekdayOfLocalDate,
  ZonedDateParts,
} from '../common/utils/time.util';
import { ClubScheduleService } from '../common/services/club-schedule.service';

export interface BusyInterval {
  startsAt: string;
  endsAt: string;
  kind: 'BOOKING' | 'MAINTENANCE';
  bookingId?: number;
  reason?: string | null;
}

export interface StationAvailability {
  stationId: number;
  label: string;
  category: string;
  pricePerHour: number;
  status: StationStatus;
  busy: BusyInterval[];
  free: { startsAt: string; endsAt: string }[];
}

export type LiveStationState = 'FREE' | 'BUSY' | 'MAINTENANCE' | 'CLOSED' | 'OFFLINE';

export interface LiveStation {
  stationId: number;
  label: string;
  category: string;
  pricePerHour: number;
  status: StationStatus;
  state: LiveStationState;
  /** Current booking ends at, when the station is busy with a booking. */
  busyUntil: string | null;
  /** True when a free window currently contains `now` (bookable immediately). */
  bookableNow: boolean;
}

export interface LiveAvailability {
  clubId: number;
  timezone: string;
  now: string;
  isOpenNow: boolean;
  counts: { total: number; free: number; busy: number; maintenance: number; offline: number };
  stations: LiveStation[];
}

const BLOCKING_STATUSES: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ClubScheduleService,
  ) {}

  private mergeIntervals(intervals: { startsAt: Date; endsAt: Date }[]) {
    const sorted = [...intervals].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const merged: { startsAt: Date; endsAt: Date }[] = [];
    for (const interval of sorted) {
      const last = merged[merged.length - 1];
      if (last && interval.startsAt <= last.endsAt) {
        if (interval.endsAt > last.endsAt) last.endsAt = interval.endsAt;
      } else {
        merged.push({ startsAt: interval.startsAt, endsAt: interval.endsAt });
      }
    }
    return merged;
  }

  private subtractWindows(
    windows: OpenWindow[],
    busy: { startsAt: Date; endsAt: Date }[],
  ): { startsAt: Date; endsAt: Date }[] {
    const merged = this.mergeIntervals(busy);
    const free: { startsAt: Date; endsAt: Date }[] = [];
    for (const window of windows) {
      let cursor = window.startsAt;
      for (const block of merged) {
        if (block.endsAt <= cursor) continue;
        if (block.startsAt >= window.endsAt) break;
        if (block.startsAt > cursor) free.push({ startsAt: cursor, endsAt: block.startsAt });
        if (block.endsAt > cursor) cursor = block.endsAt;
      }
      if (cursor < window.endsAt) free.push({ startsAt: cursor, endsAt: window.endsAt });
    }
    return free;
  }

  async getDayAvailability(clubId: number, dateIso?: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club || club.status !== ClubStatus.APPROVED) throw new NotFoundException('Club not found');

    const iso = dateIso ?? isoDateInTz(club.timezone, new Date());
    return this.computeDayAvailability(club.id, club.timezone, iso);
  }

  async computeDayAvailability(clubId: number, timezone: string, dateIso: string) {
    const date = parseIsoDate(dateIso);
    const windows = await this.schedule.openWindowsForDate(clubId, timezone, date);

    const stations = await this.prisma.station.findMany({
      where: { clubId },
      include: { category: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Fetch bookings covering the day, plus one day on each side for overnight windows.
    const rangeStart = windows.length ? windows[0].startsAt : this.dayStartUtc(timezone, date);
    const rangeEnd = windows.length
      ? windows[windows.length - 1].endsAt
      : this.dayEndUtc(timezone, date);

    const [bookings, maintenance] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where: {
          clubId,
          status: { in: BLOCKING_STATUSES },
          startsAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
        },
        select: { id: true, stationId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.maintenanceBlock.findMany({
        where: {
          station: { clubId },
          startsAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
        },
        select: { id: true, stationId: true, startsAt: true, endsAt: true, reason: true },
      }),
    ]);

    const result: StationAvailability[] = stations.map((station) => {
      const busy: BusyInterval[] = [];
      const blocked: { startsAt: Date; endsAt: Date }[] = [];

      for (const booking of bookings) {
        if (booking.stationId !== station.id) continue;
        busy.push({
          startsAt: booking.startsAt.toISOString(),
          endsAt: booking.endsAt.toISOString(),
          kind: 'BOOKING',
          bookingId: booking.id,
        });
        blocked.push({ startsAt: booking.startsAt, endsAt: booking.endsAt });
      }
      for (const block of maintenance) {
        if (block.stationId !== station.id) continue;
        busy.push({
          startsAt: block.startsAt.toISOString(),
          endsAt: block.endsAt.toISOString(),
          kind: 'MAINTENANCE',
          reason: block.reason,
        });
        blocked.push({ startsAt: block.startsAt, endsAt: block.endsAt });
      }
      busy.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

      const free =
        station.status === StationStatus.ACTIVE
          ? this.subtractWindows(windows, blocked)
          : [];

      return {
        stationId: station.id,
        label: station.label,
        category: station.category.key,
        pricePerHour: Number(station.pricePerHour),
        status: station.status,
        busy,
        free: free.map((f) => ({ startsAt: f.startsAt.toISOString(), endsAt: f.endsAt.toISOString() })),
      };
    });

    return {
      clubId,
      timezone,
      date: dateIso,
      closedAllDay: windows.length === 0,
      windows: windows.map((w) => ({ startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString() })),
      stations: result,
    };
  }

  /**
   * Lightweight "right now" snapshot for a club, designed to be polled
   * frequently (real-time availability). It reuses the same blocking-status and
   * maintenance rules as the full day view so the two can never disagree, but it
   * only returns the current state and the end of the active block per station.
   */
  async getLiveAvailability(clubId: number, now: Date = new Date()): Promise<LiveAvailability> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club || club.status !== ClubStatus.APPROVED) throw new NotFoundException('Club not found');
    return this.computeLiveAvailability(club.id, club.timezone, now);
  }

  async computeLiveAvailability(
    clubId: number,
    timezone: string,
    now: Date = new Date(),
  ): Promise<LiveAvailability> {
    const today = isoDateInTz(timezone, now);
    const [windows, stations] = await Promise.all([
      // openWindowsForDate already folds in overnight spill-over from the
      // previous local day, so a window crossing midnight is covered here.
      this.schedule.openWindowsForDate(clubId, timezone, parseIsoDate(today)),
      this.prisma.station.findMany({
        where: { clubId },
        include: { category: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const nowMs = now.getTime();
    const isOpenNow = windows.some((w) => w.startsAt.getTime() <= nowMs && nowMs < w.endsAt.getTime());

    const [bookings, maintenance] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where: {
          clubId,
          status: { in: BLOCKING_STATUSES },
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
        select: { id: true, stationId: true, endsAt: true },
      }),
      this.prisma.maintenanceBlock.findMany({
        where: { station: { clubId }, startsAt: { lte: now }, endsAt: { gt: now } },
        select: { id: true, stationId: true, endsAt: true },
      }),
    ]);

    const bookingByStation = new Map<number, Date>();
    for (const b of bookings) bookingByStation.set(b.stationId, b.endsAt);
    const maintByStation = new Map<number, Date>();
    for (const m of maintenance) maintByStation.set(m.stationId, m.endsAt);

    const counts = { total: 0, free: 0, busy: 0, maintenance: 0, offline: 0 };

    const live: LiveStation[] = stations.map((station) => {
      counts.total += 1;
      const maintenanceUntil = maintByStation.get(station.id) ?? null;
      const bookingUntil = bookingByStation.get(station.id) ?? null;

      let state: LiveStationState;
      let busyUntil: string | null = null;
      if (station.status === StationStatus.MAINTENANCE) {
        state = 'MAINTENANCE';
      } else if (station.status !== StationStatus.ACTIVE) {
        state = 'OFFLINE';
      } else if (maintenanceUntil) {
        state = 'MAINTENANCE';
        busyUntil = maintenanceUntil.toISOString();
      } else if (bookingUntil) {
        state = 'BUSY';
        busyUntil = bookingUntil.toISOString();
      } else if (!isOpenNow) {
        state = 'CLOSED';
      } else {
        state = 'FREE';
      }

      if (state === 'FREE') counts.free += 1;
      else if (state === 'BUSY') counts.busy += 1;
      else if (state === 'MAINTENANCE') counts.maintenance += 1;
      else if (state === 'OFFLINE') counts.offline += 1;

      return {
        stationId: station.id,
        label: station.label,
        category: station.category.key,
        pricePerHour: Number(station.pricePerHour),
        status: station.status,
        state,
        busyUntil,
        bookableNow: state === 'FREE',
      };
    });

    return {
      clubId,
      timezone,
      now: now.toISOString(),
      isOpenNow,
      counts,
      stations: live,
    };
  }

  private dayStartUtc(timezone: string, date: ZonedDateParts): Date {
    const windows = openWindowsForLocalDate(timezone, date, {
      closed: false,
      opensAt: '00:00',
      closesAt: '00:00',
    });
    return windows[0].startsAt;
  }

  private dayEndUtc(timezone: string, date: ZonedDateParts): Date {
    return this.dayStartUtc(timezone, nextLocalDate(date));
  }

  /** Public station-level busy intervals for a range (used by booking UI). */
  async getStationBusy(stationId: number, from: Date, to: Date) {
    const [bookings, maintenance] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where: { stationId, status: { in: BLOCKING_STATUSES }, startsAt: { lt: to }, endsAt: { gt: from } },
        select: { id: true, startsAt: true, endsAt: true },
      }),
      this.prisma.maintenanceBlock.findMany({
        where: { stationId, startsAt: { lt: to }, endsAt: { gt: from } },
        select: { id: true, startsAt: true, endsAt: true, reason: true },
      }),
    ]);
    return {
      bookings: bookings.map((b) => ({ id: b.id, startsAt: b.startsAt, endsAt: b.endsAt })),
      maintenance: maintenance.map((m) => ({
        id: m.id,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        reason: m.reason,
      })),
    };
  }

  static weekdayOf(date: ZonedDateParts) {
    return weekdayOfLocalDate(date);
  }

  static previous(date: ZonedDateParts) {
    return previousLocalDate(date);
  }
}
