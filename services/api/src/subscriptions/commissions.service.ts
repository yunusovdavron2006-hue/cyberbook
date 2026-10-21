import { Injectable, Logger } from '@nestjs/common';
import { CommissionStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { NotFoundException } from '../common/exceptions';
import { commissionAmount } from '../common/utils/money.util';
import { SubscriptionsService } from './subscriptions.service';
import { ListCommissionsQueryDto } from './dto/subscriptions.dto';

type Db = Prisma.TransactionClient;

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
  ) {}

  private serialize(entry: {
    baseAmount: bigint;
    commissionAmount: bigint;
    [key: string]: unknown;
  }) {
    return { ...entry, baseAmount: Number(entry.baseAmount), commissionAmount: Number(entry.commissionAmount) };
  }

  /**
   * Create the commission record for a completed booking. Idempotent per
   * booking via a unique idempotency key, so retries never double-charge.
   * The rate is snapshotted from the club's active subscription plan (or the
   * platform default) at the moment of creation.
   */
  async recordForBooking(
    client: Db,
    booking: { id: number; clubId: number; priceAmount: bigint; paymentId?: number | null },
  ) {
    const key = `commission:booking:${booking.id}`;
    const existing = await client.commissionLedgerEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;

    const rate = await this.subscriptions.commissionRateForClub(booking.clubId);
    const bps = Math.round(rate.bps);
    const amount = commissionAmount(booking.priceAmount, bps, bps > 0);

    try {
      return await client.commissionLedgerEntry.create({
        data: {
          clubId: booking.clubId,
          bookingId: booking.id,
          paymentId: booking.paymentId ?? null,
          baseAmount: booking.priceAmount,
          rateBps: bps,
          commissionAmount: amount,
          status: CommissionStatus.PENDING,
          idempotencyKey: key,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const row = await client.commissionLedgerEntry.findUnique({ where: { idempotencyKey: key } });
        if (row) return row;
      }
      throw error;
    }
  }

  // ------------------------------------------------------------------ reads

  async listForClub(user: AuthUser, clubId: number, query: ListCommissionsQueryDto) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const [total, items] = await this.prisma.$transaction([
      this.prisma.commissionLedgerEntry.count({ where: { clubId } }),
      this.prisma.commissionLedgerEntry.findMany({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);
    return { items: items.map((i) => this.serialize(i)), page, size, total, totalPages: Math.ceil(total / size) };
  }

  async summary(user: AuthUser, clubId: number) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const [charged, pending, byStatus] = await this.prisma.$transaction([
      this.prisma.commissionLedgerEntry.aggregate({
        where: { clubId, status: CommissionStatus.CHARGED },
        _sum: { commissionAmount: true, baseAmount: true },
      }),
      this.prisma.commissionLedgerEntry.aggregate({
        where: { clubId, status: CommissionStatus.PENDING },
        _sum: { commissionAmount: true },
      }),
      this.prisma.commissionLedgerEntry.groupBy({
        by: ['status'],
        where: { clubId },
        orderBy: { status: 'asc' },
        _sum: { commissionAmount: true },
        _count: true,
      }),
    ]);
    const rate = await this.subscriptions.commissionRateForClub(clubId);
    return {
      currency: 'UZS',
      rateBps: rate.bps,
      rateSource: rate.source,
      planKey: rate.planKey,
      chargedCommission: Number(charged._sum.commissionAmount ?? 0n),
      chargedBase: Number(charged._sum.baseAmount ?? 0n),
      pendingCommission: Number(pending._sum.commissionAmount ?? 0n),
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count,
        amount: Number(row._sum?.commissionAmount ?? 0n),
      })),
    };
  }

  // ----------------------------------------------------------------- writes

  /** Mark a PENDING commission as CHARGED (settled with the club). */
  async markCharged(user: AuthUser, entryId: number) {
    const entry = await this.prisma.commissionLedgerEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Commission entry not found');
    await this.access.assertOperatorOrAdmin(entry.clubId, user);
    const updated = await this.prisma.commissionLedgerEntry.update({
      where: { id: entryId },
      data: { status: CommissionStatus.CHARGED },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'commission.charged',
      entityType: 'CommissionLedgerEntry',
      entityId: entryId,
      metadata: { clubId: entry.clubId },
    });
    return this.serialize(updated);
  }

  /** Reverse a commission (admin only). Creates a linked compensating entry. */
  async reverse(user: AuthUser, entryId: number, reason: string) {
    if (user.role !== Role.ADMIN) throw new NotFoundException('Commission entry not found');
    const entry = await this.prisma.commissionLedgerEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Commission entry not found');
    const key = `commission:reverse:${entryId}`;
    const existing = await this.prisma.commissionLedgerEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) return this.serialize(existing);
    const reversal = await this.prisma.$transaction(async (tx) => {
      await tx.commissionLedgerEntry.update({
        where: { id: entryId },
        data: { status: CommissionStatus.REVERSED },
      });
      return tx.commissionLedgerEntry.create({
        data: {
          clubId: entry.clubId,
          bookingId: entry.bookingId,
          paymentId: entry.paymentId,
          baseAmount: entry.baseAmount,
          rateBps: entry.rateBps,
          commissionAmount: -entry.commissionAmount,
          status: CommissionStatus.REVERSED,
          reversesId: entry.id,
          idempotencyKey: key,
        },
      });
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'commission.reversed',
      entityType: 'CommissionLedgerEntry',
      entityId: entryId,
      metadata: { reason },
    });
    return this.serialize(reversal);
  }
}
