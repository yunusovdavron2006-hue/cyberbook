import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { BookingsService } from '../bookings/bookings.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, NotFoundException } from '../common/exceptions';
import { generateToken } from '../common/utils/tokens.util';

@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly bookings: BookingsService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private get ttlHours(): number {
    const features = this.config.get('app.features') as { checkInTokenTtlHours: number };
    return features.checkInTokenTtlHours;
  }

  /**
   * Issue (or re-issue) a single-use check-in token for a confirmed booking.
   * Only the booking's owner, club staff or an admin may request it. Only the
   * SHA-256 hash is persisted; the raw token is returned exactly once.
   */
  async issue(user: AuthUser, bookingId: number) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId !== user.id) {
      await this.access.assertOperatorOrAdmin(booking.clubId, user);
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new ApiException('Only confirmed bookings have a check-in QR code', 409, 'NOT_CONFIRMED');
    }

    const token = generateToken(32);
    const tokenHash = this.hash(token);
    const expiresAt = new Date(Date.now() + this.ttlHours * 60 * 60 * 1000);

    await this.prisma.checkInToken.upsert({
      where: { bookingId },
      create: { bookingId, tokenHash, expiresAt, createdById: user.id },
      update: { tokenHash, expiresAt, consumedAt: null, consumedById: null },
    });

    this.audit.log({
      actorUserId: user.id,
      action: 'checkin.token_issued',
      entityType: 'Booking',
      entityId: bookingId,
      metadata: { clubId: booking.clubId },
    });

    return {
      bookingId,
      token,
      qrPayload: `cyberbook://checkin?token=${token}`,
      expiresAt,
    };
  }

  private async loadToken(token: string) {
    const row = await this.prisma.checkInToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: {
        booking: {
          include: {
            station: { select: { id: true, label: true } },
            club: { select: { id: true, name: true, ownerId: true } },
            user: { select: { id: true, profile: { select: { displayName: true } } } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Invalid check-in token');
    if (row.consumedAt) throw new ApiException('This check-in token has already been used', 409, 'TOKEN_USED');
    if (row.expiresAt.getTime() < Date.now()) {
      throw new ApiException('This check-in token has expired', 409, 'TOKEN_EXPIRED');
    }
    return row;
  }

  /** Read-only validation for the staff confirmation screen. */
  async resolve(user: AuthUser, token: string) {
    const row = await this.loadToken(token);
    await this.access.assertOperatorOrAdmin(row.booking.clubId, user);
    const b = row.booking;
    return {
      bookingId: b.id,
      reference: b.reference,
      status: b.status,
      customerName: b.user.profile?.displayName ?? b.user.id.toString(),
      clubName: b.club.name,
      stationLabel: b.station.label,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      expiresAt: row.expiresAt,
    };
  }

  /** Consume the token and complete the booking (CONFIRMED → COMPLETED). */
  async consume(user: AuthUser, token: string) {
    const row = await this.loadToken(token);
    await this.access.assertOperatorOrAdmin(row.booking.clubId, user);

    const booking = await this.bookings.checkIn(user, row.bookingId);

    await this.prisma.checkInToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date(), consumedById: user.id },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'checkin.consumed',
      entityType: 'Booking',
      entityId: row.bookingId,
      metadata: { clubId: row.booking.clubId },
    });
    return { checkIn: true, booking };
  }

  /** Staff convenience: check in by booking reference without a token. */
  async consumeByReference(user: AuthUser, reference: string) {
    const booking = await this.prisma.booking.findUnique({ where: { reference } });
    if (!booking) throw new NotFoundException('Booking not found');
    await this.access.assertOperatorOrAdmin(booking.clubId, user);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new ApiException('Only confirmed bookings can be checked in', 409, 'NOT_CONFIRMED');
    }
    const result = await this.bookings.checkIn(user, booking.id);
    this.audit.log({
      actorUserId: user.id,
      action: 'checkin.by_reference',
      entityType: 'Booking',
      entityId: booking.id,
      metadata: { reference },
    });
    return result;
  }
}
