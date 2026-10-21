import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingStatus,
  ClubStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReferralStatus,
  Role,
  StationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { PricingService } from '../pricing/pricing.service';
import { ClubScheduleService } from '../common/services/club-schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { PromotionsService } from '../promotions/promotions.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReferralService } from '../loyalty/referral.service';
import { CommissionsService } from '../subscriptions/commissions.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ConflictException, ForbiddenException, NotFoundException } from '../common/exceptions';
import { generateBookingReference } from '../common/utils/tokens.util';
import { billableMinutes } from '../common/utils/money.util';
import {
  CancelBookingDto,
  CreateBookingDto,
  ListBookingsQueryDto,
  UpdateBookingStatusDto,
} from './dto/bookings.dto';
import { ALLOWED_TRANSITIONS, BLOCKING_STATUSES } from './booking-state';

const MINUTE_MS = 60_000;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly access: ClubAccessService,
    private readonly pricing: PricingService,
    private readonly schedule: ClubScheduleService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    @Optional() private readonly promotions?: PromotionsService,
    @Optional() private readonly loyalty?: LoyaltyService,
    @Optional() private readonly referrals?: ReferralService,
    @Optional() private readonly commissions?: CommissionsService,
  ) {}

  private get bookingCfg() {
    return this.config.get('app.booking') as {
      pendingTtlMinutes: number;
      cancellationDeadlineMinutes: number;
      minDurationMinutes: number;
      maxDurationMinutes: number;
      leadTimeMinutes: number;
      bufferMinutes: number;
      autoConfirm: boolean;
      maxHorizonDays: number;
    };
  }

  // ------------------------------------------------------------------ create

  async create(user: AuthUser, dto: CreateBookingDto, ip?: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const cfg = this.bookingCfg;

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new ApiException('startsAt and endsAt must be valid ISO-8601 timestamps');
    }
    if (endsAt <= startsAt) {
      throw new ApiException('endsAt must be after startsAt');
    }
    const minutes = billableMinutes(startsAt, endsAt);
    if (minutes % 30 !== 0) {
      throw new ApiException('Bookings must be in 30-minute increments');
    }
    if (minutes < cfg.minDurationMinutes) {
      throw new ApiException(`Minimum booking duration is ${cfg.minDurationMinutes} minutes`);
    }
    if (minutes > cfg.maxDurationMinutes) {
      throw new ApiException(`Maximum booking duration is ${cfg.maxDurationMinutes} minutes`);
    }
    const now = Date.now();
    if (startsAt.getTime() < now - MINUTE_MS) {
      throw new ApiException('You cannot book a time in the past');
    }
    if (startsAt.getTime() < now + cfg.leadTimeMinutes * MINUTE_MS) {
      throw new ApiException(`Bookings require at least ${cfg.leadTimeMinutes} minutes of lead time`);
    }
    if (startsAt.getTime() > now + cfg.maxHorizonDays * 24 * 60 * MINUTE_MS) {
      throw new ApiException(`Bookings can only be made up to ${cfg.maxHorizonDays} days in advance`);
    }

    const club = await this.prisma.club.findUnique({ where: { id: dto.clubId } });
    if (!club) throw new NotFoundException('Club not found');
    if (club.status !== ClubStatus.APPROVED) {
      throw new ConflictException('This club is not published and cannot be booked yet', 'CLUB_NOT_BOOKABLE');
    }

    const station = await this.prisma.station.findUnique({ where: { id: dto.stationId } });
    if (!station || station.clubId !== club.id) {
      throw new NotFoundException('Station not found in this club');
    }
    if (station.status !== StationStatus.ACTIVE) {
      throw new ConflictException('This station is not available for booking', 'STATION_UNAVAILABLE');
    }

    // Operating hours / special closures are validated against the club timezone.
    const withinHours = await this.schedule.isWithinOpenWindow(club.id, club.timezone, startsAt, endsAt);
    if (!withinHours) {
      throw new ConflictException(
        'The requested time is outside the club operating hours',
        'OUTSIDE_OPERATING_HOURS',
      );
    }

    // Idempotency: an identical submission must not create a second reservation.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.booking.findFirst({
        where: { userId: user.id, idempotencyKey: dto.idempotencyKey },
      });
      if (existing) return this.toDto(existing, true);
    }

    // Server-authoritative price (never trust a client-supplied price).
    const { total, snapshot } = await this.pricing.computePrice(club, station, startsAt, endsAt);

    const status = cfg.autoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING;
    const expiresAt =
      status === BookingStatus.PENDING
        ? new Date(now + cfg.pendingTtlMinutes * MINUTE_MS)
        : null;
    const bufferMs = cfg.bufferMinutes * MINUTE_MS;

    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Serialize concurrent creations for this station. The exclusion
        // constraint is the hard guarantee; this lock avoids spurious conflicts.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${station.id})`;

        const maintenance = await tx.maintenanceBlock.findFirst({
          where: { stationId: station.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
        });
        if (maintenance) {
          throw new ConflictException(
            'This station is blocked for maintenance during the requested time',
            'STATION_MAINTENANCE',
          );
        }

        const overlap = await tx.booking.findFirst({
          where: {
            stationId: station.id,
            status: { in: BLOCKING_STATUSES },
            startsAt: { lt: new Date(endsAt.getTime() + bufferMs) },
            endsAt: { gt: new Date(startsAt.getTime() - bufferMs) },
          },
        });
        if (overlap) {
          throw new ConflictException(
            'This station is already booked for the selected time',
            'SLOT_TAKEN',
          );
        }

        // Apply an optional promotion code on top of the server-authoritative
        // base price. A supplied-but-invalid code throws and rolls the tx back.
        let priceAmount = total;
        let priceSnapshot: Record<string, unknown> = snapshot as unknown as Record<string, unknown>;
        if (dto.promoCode && this.promotions) {
          const resolved = await this.promotions.resolveForBooking(tx, {
            club,
            station,
            startsAt,
            endsAt,
            subtotal: Number(total),
            userId: user.id,
            code: dto.promoCode,
          });
          if (resolved) {
            const discounted = Math.max(0, Number(total) - resolved.discount);
            priceAmount = BigInt(discounted);
            priceSnapshot = {
              ...snapshot,
              promotionId: resolved.promotion.id,
              promotionCode: resolved.promotion.code,
              discount: resolved.discount,
              total: discounted,
            };
          }
        }

        const booking = await tx.booking.create({
          data: {
            reference: generateBookingReference(),
            userId: user.id,
            clubId: club.id,
            stationId: station.id,
            startsAt,
            endsAt,
            status,
            priceAmount,
            currency: 'UZS',
            priceSnapshot: priceSnapshot as Prisma.InputJsonValue,
            paymentMethod:
              dto.paymentMethod === 'ONLINE' ? PaymentMethod.ONLINE : PaymentMethod.PAY_AT_CLUB,
            paymentStatus:
              dto.paymentMethod === 'ONLINE' ? PaymentStatus.PENDING : PaymentStatus.NOT_REQUIRED,
            expiresAt,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            actorUserId: user.id,
            type: 'CREATED',
            toStatus: status,
            metadata: { priceAmount: priceAmount.toString(), source: snapshot.source },
          },
        });

        if (priceSnapshot.promotionId && this.promotions) {
          await this.promotions.recordRedemption(tx, {
            promotionId: priceSnapshot.promotionId as number,
            userId: user.id,
            bookingId: booking.id,
            clubId: club.id,
            code: (priceSnapshot.promotionCode as string | null) ?? dto.promoCode?.toUpperCase() ?? null,
            discountAmount: priceSnapshot.discount as number,
          });
        }
        return booking;
      });
    } catch (error) {
      // Duplicate idempotency key race → return the existing booking.
      const prismaError = error as { code?: string };
      if (prismaError?.code === 'P2002' && dto.idempotencyKey) {
        const existing = await this.prisma.booking.findFirst({
          where: { userId: user.id, idempotencyKey: dto.idempotencyKey },
        });
        if (existing) return this.toDto(existing, true);
      }
      throw error;
    }

    // Post-commit side effects.
    await this.notifications.notify({
      userId: user.id,
      type: status === BookingStatus.CONFIRMED ? 'BOOKING_CONFIRMED' : 'BOOKING_CREATED',
      title:
        status === BookingStatus.CONFIRMED ? 'Booking confirmed' : 'Booking pending confirmation',
      body: `${club.name} · ${station.label} · ${startsAt.toISOString()}`,
      data: { bookingId: created.id, reference: created.reference },
    });
    await this.notifications.notifyClubOwner(club.id, {
      type: 'OWNER_NEW_BOOKING',
      title: 'New booking',
      body: `${station.label} · ${startsAt.toISOString()}`,
      data: { bookingId: created.id, reference: created.reference },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'booking.created',
      entityType: 'Booking',
      entityId: created.id,
      metadata: { clubId: club.id, stationId: station.id, status, amount: created.priceAmount.toString() },
      ip,
    });

    return this.toDto(created);
  }

  // ---------------------------------------------------------------- reads

  async listMine(user: AuthUser, query: ListBookingsQueryDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.BookingWhereInput = {
      userId: user.id,
      ...(query.status ? { status: query.status } : {}),
    };
    return this.paginated(where, page, size);
  }

  async listForClub(user: AuthUser, clubId: number, query: ListBookingsQueryDto) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.BookingWhereInput = {
      clubId,
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.date) {
      const dayStart = new Date(`${query.date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * MINUTE_MS);
      // Widen by 12h on each side so overnight shifts and timezone offsets are covered.
      where.startsAt = {
        gte: new Date(dayStart.getTime() - 12 * 60 * MINUTE_MS),
        lt: new Date(dayEnd.getTime() + 12 * 60 * MINUTE_MS),
      };
    }
    return this.paginated(where, page, size);
  }

  private async paginated(where: Prisma.BookingWhereInput, page: number, size: number) {
    const [total, items] = await this.prisma.$transaction([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        include: {
          station: { select: { id: true, label: true } },
          club: { select: { id: true, name: true, slug: true, timezone: true } },
          user: { select: { id: true, profile: { select: { displayName: true } } } },
        },
      }),
    ]);
    return {
      items: items.map((b) => this.toRichDto(b)),
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    };
  }

  async getOne(user: AuthUser, id: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        station: { select: { id: true, label: true } },
        club: { select: { id: true, name: true, slug: true, ownerId: true, timezone: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const isCustomer = booking.userId === user.id;
    const isOwner = booking.club.ownerId === user.id;
    const isAdmin = user.role === Role.ADMIN;
    let isStaff = false;
    if (!isCustomer && !isOwner && !isAdmin) {
      isStaff = Boolean(
        await this.prisma.clubMembership.findUnique({
          where: { clubId_userId: { clubId: booking.clubId, userId: user.id } },
        }),
      );
    }
    if (!isCustomer && !isOwner && !isAdmin && !isStaff) {
      throw new ForbiddenException('You do not have access to this booking');
    }
    return this.toRichDto(booking);
  }

  // --------------------------------------------------------------- cancel

  async cancel(user: AuthUser, id: number, dto: CancelBookingDto, ip?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { club: { select: { ownerId: true, name: true, timezone: true } }, station: { select: { label: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const isCustomer = booking.userId === user.id;
    const isOwnerOrStaff =
      booking.club.ownerId === user.id ||
      user.role === Role.ADMIN ||
      Boolean(
        await this.prisma.clubMembership.findUnique({
          where: { clubId_userId: { clubId: booking.clubId, userId: user.id } },
        }),
      );
    if (!isCustomer && !isOwnerOrStaff) {
      throw new ForbiddenException('You do not have access to this booking');
    }
    if (!BLOCKING_STATUSES.includes(booking.status)) {
      throw new ConflictException(
        `A ${booking.status.toLowerCase()} booking cannot be cancelled`,
        'NOT_CANCELLABLE',
      );
    }

    // Customers must respect the cancellation deadline; owners/staff/admins can cancel later.
    if (isCustomer && !isOwnerOrStaff) {
      const deadline =
        booking.startsAt.getTime() - this.bookingCfg.cancellationDeadlineMinutes * MINUTE_MS;
      if (Date.now() > deadline) {
        throw new ForbiddenException(
          `Bookings can only be cancelled up to ${this.bookingCfg.cancellationDeadlineMinutes} minutes before the start time`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancelReason: dto.reason ?? null,
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: id,
          actorUserId: user.id,
          type: 'CANCELLED',
          fromStatus: booking.status,
          toStatus: BookingStatus.CANCELLED,
          metadata: { reason: dto.reason ?? null },
        },
      });
      return result;
    });

    await this.notifications.notify({
      userId: booking.userId,
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      body: `${booking.club.name} · ${booking.station.label} · ${booking.startsAt.toISOString()}`,
      data: { bookingId: id, reference: booking.reference },
    });
    if (!isCustomer) {
      await this.notifications.notifyClubOwner(booking.clubId, {
        type: 'BOOKING_CANCELLED',
        title: 'Booking cancelled',
        body: `${booking.station.label} · ${booking.startsAt.toISOString()}`,
        data: { bookingId: id, reference: booking.reference },
      });
    }
    this.audit.log({
      actorUserId: user.id,
      action: 'booking.cancelled',
      entityType: 'Booking',
      entityId: id,
      metadata: { reason: dto.reason ?? null },
      ip,
    });
    return this.toDto(updated);
  }

  // -------------------------------------------------------- owner updates

  async updateStatus(user: AuthUser, id: number, dto: UpdateBookingStatusDto, ip?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { club: { select: { ownerId: true, name: true } }, station: { select: { label: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    await this.access.assertOperatorOrAdmin(booking.clubId, user);

    const allowed = ALLOWED_TRANSITIONS[booking.status];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Cannot change booking from ${booking.status} to ${dto.status}`,
        'INVALID_TRANSITION',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.status === BookingStatus.CANCELLED
            ? { cancelledAt: new Date(), cancelledById: user.id, cancelReason: dto.reason ?? null }
            : {}),
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: id,
          actorUserId: user.id,
          type: 'STATUS_CHANGED',
          fromStatus: booking.status,
          toStatus: dto.status,
          metadata: { reason: dto.reason ?? null },
        },
      });
      return result;
    });

    const typeMap: Partial<Record<BookingStatus, 'BOOKING_CONFIRMED' | 'BOOKING_COMPLETED' | 'BOOKING_CANCELLED'>> = {
      [BookingStatus.CONFIRMED]: 'BOOKING_CONFIRMED',
      [BookingStatus.COMPLETED]: 'BOOKING_COMPLETED',
      [BookingStatus.CANCELLED]: 'BOOKING_CANCELLED',
    };
    const notifType = typeMap[dto.status];
    if (notifType) {
      await this.notifications.notify({
        userId: booking.userId,
        type: notifType,
        title: `Booking ${dto.status.toLowerCase()}`,
        body: `${booking.club.name} · ${booking.station.label} · ${booking.startsAt.toISOString()}`,
        data: { bookingId: id, reference: booking.reference },
      });
    }
    this.audit.log({
      actorUserId: user.id,
      action: 'booking.status_changed',
      entityType: 'Booking',
      entityId: id,
      metadata: { from: booking.status, to: dto.status },
      ip,
    });
    if (dto.status === BookingStatus.COMPLETED) {
      await this.afterCompletion(updated);
    }
    return this.toDto(updated);
  }

  /** Staff check-in: confirms the customer arrived and completes the session. */
  async checkIn(user: AuthUser, id: number) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    await this.access.assertOperatorOrAdmin(booking.clubId, user);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new ConflictException('Only confirmed bookings can be checked in', 'NOT_CONFIRMED');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.booking.update({
        where: { id },
        data: { status: BookingStatus.COMPLETED },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: id,
          actorUserId: user.id,
          type: 'CHECKED_IN',
          fromStatus: BookingStatus.CONFIRMED,
          toStatus: BookingStatus.COMPLETED,
        },
      });
      return result;
    });
    await this.afterCompletion(updated);
    return this.toDto(updated);
  }

  /**
   * Post-completion side effects for a finished booking: loyalty points,
   * referral qualification/reward and platform commission. Each hook is
   * idempotent and best-effort — a failure is logged but never rolls back the
   * already-committed completion.
   */
  private async afterCompletion(booking: {
    id: number;
    userId: number;
    clubId: number;
    startsAt: Date;
    endsAt: Date;
    priceAmount: bigint;
  }): Promise<void> {
    if (this.loyalty) {
      try {
        await this.loyalty.awardBookingCompletion(this.prisma, {
          id: booking.id,
          userId: booking.userId,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        });
      } catch (error) {
        this.logger.warn(`Loyalty award failed for booking ${booking.id}: ${(error as Error).message}`);
      }
    }
    if (this.referrals) {
      try {
        const referral = await this.referrals.onBookingCompleted(
          this.prisma,
          booking.userId,
          booking.id,
        );
        if (referral && referral.status === ReferralStatus.REWARDED) {
          await this.referrals.notifyReward(referral);
        }
      } catch (error) {
        this.logger.warn(`Referral hook failed for booking ${booking.id}: ${(error as Error).message}`);
      }
    }
    if (this.commissions) {
      try {
        await this.commissions.recordForBooking(this.prisma, {
          id: booking.id,
          clubId: booking.clubId,
          priceAmount: booking.priceAmount,
        });
      } catch (error) {
        this.logger.warn(`Commission hook failed for booking ${booking.id}: ${(error as Error).message}`);
      }
    }
  }

  // ----------------------------------------------------------- owner stats

  async clubDashboard(user: AuthUser, clubId: number) {
    const club = await this.access.assertOperatorOrAdmin(clubId, user);
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [today, upcoming, completed, cancelled, stations] = await this.prisma.$transaction([
      this.prisma.booking.count({
        where: { clubId, startsAt: { gte: dayStart }, status: { in: BLOCKING_STATUSES } },
      }),
      this.prisma.booking.count({
        where: { clubId, startsAt: { gt: now }, status: { in: BLOCKING_STATUSES } },
      }),
      this.prisma.booking.count({ where: { clubId, status: BookingStatus.COMPLETED } }),
      this.prisma.booking.count({ where: { clubId, status: BookingStatus.CANCELLED } }),
      this.prisma.station.findMany({ where: { clubId }, select: { status: true } }),
    ]);

    const [todayBookings, weekStats] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where: { clubId, startsAt: { gte: dayStart }, status: { in: BLOCKING_STATUSES } },
        select: { startsAt: true, endsAt: true, priceAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          clubId,
          startsAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * MINUTE_MS) },
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
        },
        _sum: { priceAmount: true },
      }),
    ]);

    const activeStations = stations.filter((s) => s.status === StationStatus.ACTIVE).length;
    const bookedMinutes = todayBookings.reduce(
      (sum, b) => sum + billableMinutes(b.startsAt, b.endsAt),
      0,
    );
    const operatingMinutes = 14 * 60; // documented assumption for occupancy baseline
    const occupancyPercent =
      activeStations > 0
        ? Math.min(100, Math.round(((bookedMinutes / (activeStations * operatingMinutes)) * 100 + Number.EPSILON) * 10) / 10)
        : 0;

    const grossToday = todayBookings.reduce((sum, b) => sum + b.priceAmount, 0n);

    return {
      club: { id: club.id, name: club.name, status: club.status },
      todayBookings: today,
      upcomingBookings: upcoming,
      completedBookings: completed,
      cancelledBookings: cancelled,
      activeStations,
      totalStations: stations.length,
      occupancyPercent,
      // Gross booking value for today's active bookings — NOT money received.
      grossBookingValueToday: Number(grossToday),
      // Gross confirmed+completed value over the last 7 days.
      grossBookingValue7d: Number(weekStats._sum.priceAmount ?? 0n),
      note: 'Gross booking value is the value of bookings, not settled payments.',
    };
  }

  // ------------------------------------------------------------- expiry

  /** Releases expired PENDING reservations so they stop blocking availability. */
  async expirePendingBookings(): Promise<number> {
    const now = new Date();
    const expiring = await this.prisma.booking.findMany({
      where: { status: BookingStatus.PENDING, expiresAt: { lt: now } },
      select: { id: true, userId: true, reference: true },
      take: 200,
    });
    if (expiring.length === 0) return 0;

    const ids = expiring.map((b) => b.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: { id: { in: ids }, status: BookingStatus.PENDING },
        data: { status: BookingStatus.EXPIRED },
      });
      await tx.bookingEvent.createMany({
        data: ids.map((id) => ({
          bookingId: id,
          type: 'EXPIRED',
          fromStatus: BookingStatus.PENDING,
          toStatus: BookingStatus.EXPIRED,
          metadata: { reason: 'pending TTL elapsed' },
        })),
      });
    });
    this.logger.log(`Expired ${ids.length} pending booking(s)`);
    return ids.length;
  }

  /** Reminder sweep for bookings starting soon. Idempotent per booking via event log. */
  async sendUpcomingReminders(): Promise<number> {
    const now = new Date();
    const soon = new Date(now.getTime() + 60 * MINUTE_MS);
    const candidates = await this.prisma.booking.findMany({
      where: { status: BookingStatus.CONFIRMED, startsAt: { gte: now, lte: soon } },
      select: { id: true, userId: true, reference: true, startsAt: true },
      take: 200,
    });
    let sent = 0;
    for (const booking of candidates) {
      const already = await this.prisma.bookingEvent.findFirst({
        where: { bookingId: booking.id, type: 'REMINDER_SENT' },
      });
      if (already) continue;
      await this.prisma.bookingEvent.create({
        data: { bookingId: booking.id, type: 'REMINDER_SENT', metadata: { at: now.toISOString() } },
      });
      await this.notifications.notify({
        userId: booking.userId,
        type: 'BOOKING_REMINDER',
        title: 'Upcoming reservation',
        body: `Your booking ${booking.reference} starts ${booking.startsAt.toISOString()}`,
        data: { bookingId: booking.id },
      });
      sent += 1;
    }
    return sent;
  }

  // -------------------------------------------------------------- mappers

  private toDto(
    booking: {
      id: number;
      reference: string;
      userId: number;
      clubId: number;
      stationId: number;
      startsAt: Date;
      endsAt: Date;
      status: BookingStatus;
      priceAmount: bigint;
      currency: string;
      paymentStatus: PaymentStatus;
      paymentMethod: PaymentMethod;
      expiresAt: Date | null;
      createdAt: Date;
    },
    idempotentReplay = false,
  ) {
    return {
      id: booking.id,
      reference: booking.reference,
      userId: booking.userId,
      clubId: booking.clubId,
      stationId: booking.stationId,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      priceAmount: Number(booking.priceAmount),
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      expiresAt: booking.expiresAt,
      createdAt: booking.createdAt,
      ...(idempotentReplay ? { idempotentReplay: true } : {}),
    };
  }

  private toRichDto(booking: {
    id: number;
    reference: string;
    userId: number;
    clubId: number;
    stationId: number;
    startsAt: Date;
    endsAt: Date;
    status: BookingStatus;
    priceAmount: bigint;
    currency: string;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    expiresAt: Date | null;
    cancelReason?: string | null;
    createdAt: Date;
    station?: { id: number; label: string } | null;
    club?: { id: number; name: string; slug: string; timezone: string } | null;
    user?: { id: number; profile?: { displayName: string | null } | null } | null;
    events?: unknown[];
  }) {
    return {
      id: booking.id,
      reference: booking.reference,
      userId: booking.userId,
      customerName: booking.user?.profile?.displayName ?? null,
      clubId: booking.clubId,
      clubName: booking.club?.name ?? null,
      clubSlug: booking.club?.slug ?? null,
      timezone: booking.club?.timezone ?? 'Asia/Tashkent',
      stationId: booking.stationId,
      stationLabel: booking.station?.label ?? null,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      priceAmount: Number(booking.priceAmount),
      currency: booking.currency,
      paymentStatus: booking.paymentStatus,
      paymentMethod: booking.paymentMethod,
      expiresAt: booking.expiresAt,
      cancelReason: booking.cancelReason ?? null,
      createdAt: booking.createdAt,
      ...(booking.events ? { events: booking.events } : {}),
    };
  }
}
