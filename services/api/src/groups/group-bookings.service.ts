import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  BookingStatus,
  ClubStatus,
  GroupBookingStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  StationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { PricingService } from '../pricing/pricing.service';
import { PromotionsService } from '../promotions/promotions.service';
import { ClubScheduleService } from '../common/services/club-schedule.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ConflictException, NotFoundException } from '../common/exceptions';
import { generateBookingReference, generateGroupReference, generateToken } from '../common/utils/tokens.util';
import { billableMinutes } from '../common/utils/money.util';
import { BLOCKING_STATUSES } from '../bookings/booking-state';
import { CreateGroupBookingDto } from './dto/groups.dto';

const MINUTE_MS = 60_000;

@Injectable()
export class GroupBookingsService {
  private readonly logger = new Logger(GroupBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly pricing: PricingService,
    private readonly promotions: PromotionsService,
    private readonly schedule: ClubScheduleService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private get bookingCfg() {
    return this.config.get('app.booking') as {
      pendingTtlMinutes: number;
      minDurationMinutes: number;
      maxDurationMinutes: number;
      leadTimeMinutes: number;
      bufferMinutes: number;
      autoConfirm: boolean;
      maxHorizonDays: number;
      inviteTtlDays: number;
    };
  }

  async create(user: AuthUser, dto: CreateGroupBookingDto, ip?: string) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const cfg = this.bookingCfg;
    const stationIds = Array.from(new Set(dto.stationIds));

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new ApiException('startsAt and endsAt must be a valid window');
    }
    const minutes = billableMinutes(startsAt, endsAt);
    if (minutes % 30 !== 0) throw new ApiException('Bookings must be in 30-minute increments');
    if (minutes < cfg.minDurationMinutes) {
      throw new ApiException(`Minimum booking duration is ${cfg.minDurationMinutes} minutes`);
    }
    if (minutes > cfg.maxDurationMinutes) {
      throw new ApiException(`Maximum booking duration is ${cfg.maxDurationMinutes} minutes`);
    }
    const now = Date.now();
    if (startsAt.getTime() < now + cfg.leadTimeMinutes * MINUTE_MS) {
      throw new ApiException('You cannot book a time in the past');
    }
    if (startsAt.getTime() > now + cfg.maxHorizonDays * 24 * 60 * MINUTE_MS) {
      throw new ApiException(`Bookings can only be made up to ${cfg.maxHorizonDays} days in advance`);
    }

    const club = await this.prisma.club.findUnique({ where: { id: dto.clubId } });
    if (!club) throw new NotFoundException('Club not found');
    if (club.status !== ClubStatus.APPROVED) {
      throw new ConflictException('This club is not published and cannot be booked yet', 'CLUB_NOT_BOOKABLE');
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.groupBooking.findFirst({
        where: { userId: user.id, idempotencyKey: dto.idempotencyKey },
        include: { bookings: { include: { station: { select: { id: true, label: true } } } } },
      });
      if (existing) return this.toDto(existing, true);
    }

    const stations = await this.prisma.station.findMany({ where: { id: { in: stationIds } } });
    if (stations.length !== stationIds.length) throw new NotFoundException('One or more stations were not found');
    for (const s of stations) {
      if (s.clubId !== club.id) throw new NotFoundException('All stations must belong to the same club');
      if (s.status !== StationStatus.ACTIVE) {
        throw new ConflictException(`Station ${s.label} is not available`, 'STATION_UNAVAILABLE');
      }
    }

    const withinHours = await this.schedule.isWithinOpenWindow(club.id, club.timezone, startsAt, endsAt);
    if (!withinHours) {
      throw new ConflictException('The requested time is outside the club operating hours', 'OUTSIDE_OPERATING_HOURS');
    }

    const bufferMs = cfg.bufferMinutes * MINUTE_MS;
    const status = cfg.autoConfirm ? BookingStatus.CONFIRMED : BookingStatus.PENDING;
    const expiresAt = status === BookingStatus.PENDING ? new Date(now + cfg.pendingTtlMinutes * MINUTE_MS) : null;

    // Pre-compute price + promotion per station (needs no lock, cheap).
    const priced = await Promise.all(
      stations.map(async (station) => {
        const { total, snapshot } = await this.pricing.computePrice(club, station, startsAt, endsAt);
        return { station, total, snapshot };
      }),
    );

    let group: Parameters<typeof this.toDto>[0];
    try {
      group = await this.prisma.$transaction(async (tx) => {
        // Lock all stations in a stable order to avoid deadlocks.
        for (const id of [...stationIds].sort((a, b) => a - b)) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${id})`;
        }

        for (const { station } of priced) {
          const maintenance = await tx.maintenanceBlock.findFirst({
            where: { stationId: station.id, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
          });
          if (maintenance) {
            throw new ConflictException(`${station.label} is blocked for maintenance`, 'STATION_MAINTENANCE');
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
            throw new ConflictException(`${station.label} is already booked for the selected time`, 'SLOT_TAKEN');
          }
        }

        const createdGroup = await tx.groupBooking.create({
          data: {
            reference: generateGroupReference(),
            userId: user.id,
            clubId: club.id,
            startsAt,
            endsAt,
            status: status === BookingStatus.CONFIRMED ? GroupBookingStatus.CONFIRMED : GroupBookingStatus.PENDING,
            seatsRequested: stationIds.length,
            seatsConfirmed: status === BookingStatus.CONFIRMED ? stationIds.length : 0,
            totalAmount: 0n,
            currency: 'UZS',
            notes: dto.notes ?? null,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
        });

        let total = 0n;
        for (const { station, total: lineTotal, snapshot } of priced) {
          let finalTotal = lineTotal;
          let snapshotOut: Record<string, unknown> = snapshot as unknown as Record<string, unknown>;
          if (dto.promoCode) {
            const promo = await this.promotions.resolveForBooking(tx, {
              club,
              station,
              startsAt,
              endsAt,
              subtotal: Number(lineTotal),
              userId: user.id,
              code: dto.promoCode,
            });
            if (promo) {
              const discounted = Number(lineTotal) - promo.discount;
              finalTotal = BigInt(discounted);
              snapshotOut = {
                ...snapshot,
                promotionId: promo.promotion.id,
                discount: promo.discount,
                total: discounted,
              };
            }
          }
          total += finalTotal;

          const booking = await tx.booking.create({
            data: {
              reference: generateBookingReference(),
              userId: user.id,
              clubId: club.id,
              stationId: station.id,
              startsAt,
              endsAt,
              status,
              priceAmount: finalTotal,
              currency: 'UZS',
              priceSnapshot: snapshotOut as Prisma.InputJsonValue,
              paymentMethod: PaymentMethod.PAY_AT_CLUB,
              paymentStatus: PaymentStatus.NOT_REQUIRED,
              expiresAt,
              groupId: createdGroup.id,
            },
          });
          await tx.bookingEvent.create({
            data: {
              bookingId: booking.id,
              actorUserId: user.id,
              type: 'GROUP_CREATED',
              toStatus: status,
              metadata: { groupId: createdGroup.id, reference: createdGroup.reference },
            },
          });

          if (dto.promoCode && snapshotOut.promotionId) {
            await this.promotions.recordRedemption(tx, {
              promotionId: snapshotOut.promotionId as number,
              userId: user.id,
              bookingId: booking.id,
              clubId: club.id,
              code: dto.promoCode.toUpperCase(),
              discountAmount: snapshotOut.discount as number,
            });
          }
        }

        if (dto.participants && dto.participants.length > 0) {
          await tx.groupBookingParticipant.createMany({
            data: dto.participants.map((p) => ({
              groupId: createdGroup.id,
              name: p.name ?? null,
              email: p.email ?? null,
            })),
          });
        }

        return tx.groupBooking.update({
          where: { id: createdGroup.id },
          data: { totalAmount: total },
          include: {
            bookings: { include: { station: { select: { id: true, label: true } } } },
            participants: true,
          },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' && dto.idempotencyKey) {
        const existing = await this.prisma.groupBooking.findFirst({
          where: { userId: user.id, idempotencyKey: dto.idempotencyKey },
          include: { bookings: { include: { station: { select: { id: true, label: true } } } } },
        });
        if (existing) return this.toDto(existing, true);
      }
      throw error;
    }

    await this.notifications.notify({
      userId: user.id,
      type: 'GROUP_BOOKING_CREATED',
      title: 'Group booking created',
      body: `${club.name} · ${stationIds.length} seats · ${startsAt.toISOString()}`,
      data: { groupId: group.id, reference: group.reference },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'group_booking.created',
      entityType: 'GroupBooking',
      entityId: group.id,
      metadata: { clubId: club.id, seats: stationIds.length, total: group.totalAmount.toString() },
      ip,
    });

    return this.toDto(group);
  }

  async listMine(user: AuthUser) {
    const groups = await this.prisma.groupBooking.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        club: { select: { id: true, name: true, slug: true } },
        bookings: { include: { station: { select: { id: true, label: true } } } },
      },
    });
    return groups.map((g) => this.toDto(g));
  }

  async getOne(user: AuthUser, id: number) {
    const group = await this.prisma.groupBooking.findUnique({
      where: { id },
      include: {
        club: { select: { id: true, name: true, slug: true, ownerId: true, timezone: true } },
        bookings: { include: { station: { select: { id: true, label: true } } } },
        participants: true,
      },
    });
    if (!group) throw new NotFoundException('Group booking not found');
    if (group.userId !== user.id) {
      await this.access.assertOperatorOrAdmin(group.clubId, user);
    }
    return this.toDto(group);
  }

  async cancel(user: AuthUser, id: number, reason?: string) {
    const group = await this.prisma.groupBooking.findUnique({
      where: { id },
      include: { bookings: true, club: { select: { ownerId: true } } },
    });
    if (!group) throw new NotFoundException('Group booking not found');
    const isOrganizer = group.userId === user.id;
    if (!isOrganizer) await this.access.assertOperatorOrAdmin(group.clubId, user);

    if (!([GroupBookingStatus.PENDING, GroupBookingStatus.CONFIRMED, GroupBookingStatus.PARTIALLY_CANCELLED] as GroupBookingStatus[]).includes(group.status)) {
      throw new ConflictException('This group booking can no longer be cancelled', 'NOT_CANCELLABLE');
    }

    const cancellable = group.bookings.filter((b) => (BLOCKING_STATUSES as BookingStatus[]).includes(b.status));
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: { id: { in: cancellable.map((b) => b.id) } },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancelReason: reason ?? null,
        },
      });
      await tx.bookingEvent.createMany({
        data: cancellable.map((b) => ({
          bookingId: b.id,
          actorUserId: user.id,
          type: 'GROUP_CANCELLED',
          fromStatus: b.status,
          toStatus: BookingStatus.CANCELLED,
          metadata: { groupId: group.id, reason: reason ?? null },
        })),
      });
      return tx.groupBooking.update({
        where: { id },
        data: { status: GroupBookingStatus.CANCELLED, seatsConfirmed: 0 },
        include: {
          club: { select: { id: true, name: true, slug: true } },
          bookings: { include: { station: { select: { id: true, label: true } } } },
        },
      });
    });

    this.audit.log({
      actorUserId: user.id,
      action: 'group_booking.cancelled',
      entityType: 'GroupBooking',
      entityId: id,
      metadata: { cancelledBookings: cancellable.length },
    });
    return this.toDto(result);
  }

  /**
   * Create (or re-issue) invitations for a group booking. Raw tokens are
   * returned exactly once; only their SHA-256 hashes are persisted. Organizers
   * and club operators may invite; an existing invite for the same email is
   * refreshed with a new token and expiry.
   */
  async createInvites(user: AuthUser, groupId: number, invitees: { name?: string; email?: string }[]) {
    const group = await this.prisma.groupBooking.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group booking not found');
    if (group.userId !== user.id) await this.access.assertOperatorOrAdmin(group.clubId, user);

    const cfg = this.bookingCfg;
    const expiresAt = new Date(Date.now() + cfg.inviteTtlDays * 24 * 60 * 60_000);
    const invitedAt = new Date();

    const created: { id: number; email: string | null; name: string | null; token: string; inviteExpiresAt: Date }[] = [];

    for (const invitee of invitees) {
      const email = invitee.email?.trim().toLowerCase() || null;
      if (!email && !invitee.name?.trim()) continue;
      const token = generateToken(24);
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const existing = email
        ? await this.prisma.groupBookingParticipant.findFirst({ where: { groupId, email } })
        : null;

      let participant;
      if (existing) {
        participant = await this.prisma.groupBookingParticipant.update({
          where: { id: existing.id },
          data: {
            name: invitee.name?.trim() || existing.name,
            inviteTokenHash: tokenHash,
            inviteExpiresAt: expiresAt,
            invitedAt,
            acceptedAt: null,
            declinedAt: null,
          },
        });
      } else {
        participant = await this.prisma.groupBookingParticipant.create({
          data: {
            groupId,
            name: invitee.name?.trim() || null,
            email,
            inviteTokenHash: tokenHash,
            inviteExpiresAt: expiresAt,
            invitedAt,
          },
        });
      }
      created.push({
        id: participant.id,
        email: participant.email,
        name: participant.name,
        token,
        inviteExpiresAt: expiresAt,
      });
    }

    this.audit.log({
      actorUserId: user.id,
      action: 'group_booking.invites_created',
      entityType: 'GroupBooking',
      entityId: groupId,
      metadata: { count: created.length },
    });

    return {
      groupId,
      inviteExpiresAt: expiresAt,
      invites: created.map((c) => ({
        participantId: c.id,
        email: c.email,
        name: c.name,
        inviteToken: c.token,
        inviteExpiresAt: c.inviteExpiresAt,
      })),
    };
  }

  /** Organizer/operator view of invitees without exposing raw tokens. */
  async listInvites(user: AuthUser, groupId: number) {
    const group = await this.prisma.groupBooking.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group booking not found');
    if (group.userId !== user.id) await this.access.assertOperatorOrAdmin(group.clubId, user);
    return this.participantsFor(groupId);
  }

  private async participantsFor(groupId: number) {
    const rows = await this.prisma.groupBookingParticipant.findMany({
      where: { groupId },
      orderBy: { id: 'asc' },
    });
    const now = Date.now();
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      role: p.role,
      status: p.acceptedAt
        ? 'ACCEPTED'
        : p.declinedAt
          ? 'DECLINED'
          : p.inviteTokenHash
            ? p.inviteExpiresAt && p.inviteExpiresAt.getTime() < now
              ? 'EXPIRED'
              : 'PENDING'
            : 'MEMBER',
      invitedAt: p.invitedAt,
      inviteExpiresAt: p.inviteExpiresAt,
      acceptedAt: p.acceptedAt,
      declinedAt: p.declinedAt,
    }));
  }

  async revokeInvite(user: AuthUser, groupId: number, participantId: number) {
    const group = await this.prisma.groupBooking.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group booking not found');
    if (group.userId !== user.id) await this.access.assertOperatorOrAdmin(group.clubId, user);

    const participant = await this.prisma.groupBookingParticipant.findUnique({ where: { id: participantId } });
    if (!participant || participant.groupId !== groupId) throw new NotFoundException('Invitee not found');

    await this.prisma.groupBookingParticipant.update({
      where: { id: participantId },
      data: { inviteTokenHash: null, inviteExpiresAt: null },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'group_booking.invite_revoked',
      entityType: 'GroupBooking',
      entityId: groupId,
      metadata: { participantId },
    });
    return { revoked: true };
  }

  /** Accept or decline an invitation by raw token. Idempotent-ish: only a live, unconsumed token works. */
  async respondToInvite(user: AuthUser, token: string, action: 'accept' | 'decline') {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const participant = await this.prisma.groupBookingParticipant.findFirst({
      where: { inviteTokenHash: tokenHash },
      include: { group: { select: { id: true, status: true, startsAt: true } } },
    });
    if (!participant) throw new NotFoundException('Invitation not found or already used');
    if (participant.acceptedAt || participant.declinedAt) {
      throw new ConflictException('This invitation has already been answered', 'INVITE_ALREADY_ANSWERED');
    }
    if (participant.inviteExpiresAt && participant.inviteExpiresAt.getTime() < Date.now()) {
      throw new ConflictException('This invitation has expired', 'INVITE_EXPIRED');
    }

    const now = new Date();
    const updated = await this.prisma.groupBookingParticipant.update({
      where: { id: participant.id },
      data:
        action === 'accept'
          ? { acceptedAt: now, declinedAt: null, userId: user.id, email: participant.email ?? undefined }
          : { declinedAt: now, acceptedAt: null },
    });

    this.audit.log({
      actorUserId: user.id,
      action: action === 'accept' ? 'group_booking.invite_accepted' : 'group_booking.invite_declined',
      entityType: 'GroupBooking',
      entityId: participant.groupId,
      metadata: { participantId: participant.id },
    });

    return {
      participantId: updated.id,
      groupId: participant.groupId,
      status: action === 'accept' ? 'ACCEPTED' : 'DECLINED',
    };
  }

  /** Invitations addressed to the current user's email that await a response. */
  async listMyInvites(user: AuthUser) {
    const rows = await this.prisma.groupBookingParticipant.findMany({
      where: {
        email: user.email.toLowerCase(),
        inviteTokenHash: { not: null },
        acceptedAt: null,
        declinedAt: null,
      },
      orderBy: { id: 'desc' },
      include: {
        group: {
          include: {
            club: { select: { id: true, name: true, slug: true } },
            bookings: { include: { station: { select: { id: true, label: true } } } },
          },
        },
      },
    });
    const now = Date.now();
    return rows
      .filter((p) => !p.inviteExpiresAt || p.inviteExpiresAt.getTime() >= now)
      .map((p) => ({
        participantId: p.id,
        name: p.name,
        email: p.email,
        group: this.toDto(p.group),
      }));
  }

  private toDto(group: {
    id: number;
    reference: string;
    userId: number;
    clubId: number;
    startsAt: Date;
    endsAt: Date;
    status: GroupBookingStatus;
    seatsRequested: number;
    seatsConfirmed: number;
    totalAmount: bigint;
    currency: string;
    notes: string | null;
    createdAt: Date;
    club?: { id: number; name: string; slug: string } | null;
    bookings?: { id: number; reference: string; stationId: number; status: BookingStatus; station?: { label: string } | null }[];
    participants?: {
      id: number;
      name: string | null;
      email: string | null;
      role?: string;
      inviteTokenHash?: string | null;
      inviteExpiresAt?: Date | null;
      invitedAt?: Date | null;
      acceptedAt?: Date | null;
      declinedAt?: Date | null;
    }[];
    [key: string]: unknown;
  }, idempotentReplay = false) {
    return {
      id: group.id,
      reference: group.reference,
      userId: group.userId,
      clubId: group.clubId,
      clubName: group.club?.name ?? null,
      clubSlug: group.club?.slug ?? null,
      startsAt: group.startsAt,
      endsAt: group.endsAt,
      status: group.status,
      seatsRequested: group.seatsRequested,
      seatsConfirmed: group.seatsConfirmed,
      totalAmount: Number(group.totalAmount),
      currency: group.currency,
      notes: group.notes,
      createdAt: group.createdAt,
      bookings: group.bookings?.map((b) => ({
        id: b.id,
        reference: b.reference,
        stationId: b.stationId,
        stationLabel: b.station?.label ?? null,
        status: b.status,
      })) ?? [],
      participants:
        group.participants?.map((p) => {
          const now = Date.now();
          const status = p.acceptedAt
            ? 'ACCEPTED'
            : p.declinedAt
              ? 'DECLINED'
              : p.inviteTokenHash
                ? p.inviteExpiresAt && p.inviteExpiresAt.getTime() < now
                  ? 'EXPIRED'
                  : 'PENDING'
                : 'MEMBER';
          return {
            id: p.id,
            name: p.name,
            email: p.email,
            role: p.role ?? 'MEMBER',
            status,
            invitedAt: p.invitedAt ?? null,
            inviteExpiresAt: p.inviteExpiresAt ?? null,
            acceptedAt: p.acceptedAt ?? null,
            declinedAt: p.declinedAt ?? null,
          };
        }) ?? [],
      ...(idempotentReplay ? { idempotentReplay: true } : {}),
    };
  }
}
