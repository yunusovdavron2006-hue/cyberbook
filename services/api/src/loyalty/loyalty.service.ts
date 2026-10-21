import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoyaltyEntryType, LoyaltyLedgerEntry, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ForbiddenException } from '../common/exceptions';
import { billableMinutes } from '../common/utils/money.util';
import { pointsForDuration, pointsToUzs, tierForBalance } from '../common/utils/loyalty.util';
import { AdjustPointsDto, ListLedgerQueryDto, RedeemPointsDto } from './dto/loyalty.dto';

type Db = Prisma.TransactionClient;

export interface AwardPointsInput {
  userId: number;
  type: LoyaltyEntryType;
  points: number;
  reason: string;
  idempotencyKey: string;
  bookingId?: number | null;
  referralId?: number | null;
  actorUserId?: number | null;
  expiresAt?: Date | null;
}

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private get features() {
    return this.config.get('app.features') as {
      loyaltyEarnPointsPerHour: number;
      referralRewardPoints: number;
      refereeBonusPoints: number;
    };
  }

  // -------------------------------------------------------------- ledger ops

  /**
   * Idempotent ledger write. A unique idempotencyKey guarantees a retried
   * business event cannot double-credit or double-debit.
   */
  async awardPoints(client: Db, input: AwardPointsInput): Promise<LoyaltyLedgerEntry> {
    const existing = await client.loyaltyLedgerEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;
    try {
      return await client.loyaltyLedgerEntry.create({
        data: {
          userId: input.userId,
          type: input.type,
          points: input.points,
          reason: input.reason,
          bookingId: input.bookingId ?? null,
          referralId: input.referralId ?? null,
          actorUserId: input.actorUserId ?? null,
          idempotencyKey: input.idempotencyKey,
          expiresAt: input.expiresAt ?? null,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const row = await client.loyaltyLedgerEntry.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (row) return row;
      }
      throw error;
    }
  }

  async balanceOf(client: Db, userId: number): Promise<number> {
    const agg = await client.loyaltyLedgerEntry.aggregate({
      where: { userId },
      _sum: { points: true },
    });
    return agg._sum.points ?? 0;
  }

  // ------------------------------------------------------------------ public

  async account(userId: number) {
    const [balance, recent] = await this.prisma.$transaction([
      this.prisma.loyaltyLedgerEntry.aggregate({ where: { userId }, _sum: { points: true } }),
      this.prisma.loyaltyLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const points = balance._sum.points ?? 0;
    return {
      balance: points,
      tier: tierForBalance(points),
      valueUzs: pointsToUzs(points),
      recent,
      earnRate: `${this.features.loyaltyEarnPointsPerHour} pts / hour played`,
    };
  }

  async ledger(userId: number, query: ListLedgerQueryDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.loyaltyLedgerEntry.count({ where: { userId } }),
      this.prisma.loyaltyLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
    return { items, page, size, total, totalPages: Math.ceil(total / size) };
  }

  async redeem(user: AuthUser, dto: RedeemPointsDto) {
    const key = dto.idempotencyKey || `redeem:${user.id}:${Date.now()}:${dto.points}`;
    const existing = await this.prisma.loyaltyLedgerEntry.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) {
      // Replay: report the same result without debiting again.
      const balance = await this.balanceOf(this.prisma, user.id);
      return { pointsSpent: Math.abs(existing.points), valueUzs: pointsToUzs(Math.abs(existing.points)), balance, replay: true };
    }

    const balance = await this.balanceOf(this.prisma, user.id);
    if (dto.points > balance) {
      throw new ApiException(
        `Insufficient points: balance is ${balance}, requested ${dto.points}`,
        400,
        'INSUFFICIENT_POINTS',
      );
    }
    await this.awardPoints(this.prisma, {
      userId: user.id,
      type: LoyaltyEntryType.REDEEM,
      points: -dto.points,
      reason: `Redeemed ${dto.points} points`,
      idempotencyKey: key,
    });
    const newBalance = await this.balanceOf(this.prisma, user.id);
    await this.notifications.notify({
      userId: user.id,
      type: 'LOYALTY_REDEEMED',
      title: 'Points redeemed',
      body: `You redeemed ${dto.points} points (${pointsToUzs(dto.points)} so'm value).`,
      data: { points: dto.points, valueUzs: pointsToUzs(dto.points) },
    });
    return { pointsSpent: dto.points, valueUzs: pointsToUzs(dto.points), balance: newBalance };
  }

  async adjust(actor: AuthUser, dto: AdjustPointsDto) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Admin only');
    const key = dto.idempotencyKey || `adjust:${dto.userId}:${Date.now()}:${dto.points}`;
    const entry = await this.awardPoints(this.prisma, {
      userId: dto.userId,
      type: LoyaltyEntryType.ADJUST,
      points: dto.points,
      reason: dto.reason,
      idempotencyKey: key,
      actorUserId: actor.id,
    });
    this.audit.log({
      actorUserId: actor.id,
      action: 'loyalty.adjusted',
      entityType: 'LoyaltyLedgerEntry',
      entityId: entry.id,
      metadata: { userId: dto.userId, points: dto.points, reason: dto.reason },
    });
    const balance = await this.balanceOf(this.prisma, dto.userId);
    return { entry, balance };
  }

  // -------------------------------------------------------------- internal

  /** Award the standard points for a completed booking. Idempotent per booking. */
  async awardBookingCompletion(
    client: Db,
    booking: { id: number; userId: number; startsAt: Date; endsAt: Date },
  ): Promise<LoyaltyLedgerEntry | null> {
    const minutes = billableMinutes(booking.startsAt, booking.endsAt);
    const points = pointsForDuration(minutes, this.features.loyaltyEarnPointsPerHour);
    if (points <= 0) return null;
    const entry = await this.awardPoints(client, {
      userId: booking.userId,
      type: LoyaltyEntryType.EARN,
      points,
      reason: `Earned for booking #${booking.id}`,
      bookingId: booking.id,
      idempotencyKey: `booking-complete:${booking.id}`,
    });
    return entry;
  }
}
