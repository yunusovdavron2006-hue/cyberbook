import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ForbiddenException, NotFoundException } from '../common/exceptions';
import { billableMinutes } from '../common/utils/money.util';
import { utcToZonedParts } from '../common/utils/time.util';
import {
  AiProviderConfig,
  ClubMetrics,
  heuristicInsight,
  remoteInsight,
} from './ai-provider';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private get aiConfig(): AiProviderConfig {
    return this.config.get('app.features.ai') as AiProviderConfig;
  }

  // ------------------------------------------------------------- metrics

  async computeClubMetrics(clubId: number, periodDays = 30): Promise<ClubMetrics> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) throw new NotFoundException('Club not found');

    const to = new Date();
    const from = new Date(to.getTime() - periodDays * DAY_MS);

    const bookings = await this.prisma.booking.findMany({
      where: { clubId, startsAt: { gte: from, lte: to } },
      select: {
        id: true,
        status: true,
        priceAmount: true,
        startsAt: true,
        endsAt: true,
        createdAt: true,
        stationId: true,
        station: { select: { label: true } },
      },
    });

    const completed = bookings.filter((b) => b.status === BookingStatus.COMPLETED);
    const cancelled = bookings.filter((b) => b.status === BookingStatus.CANCELLED);
    const revenue = completed.reduce((sum, b) => sum + Number(b.priceAmount), 0);

    // Occupancy across *active* stations over the period's operating window
    // (documented simplification: 14 operating hours per day).
    const activeStations = await this.prisma.station.count({
      where: { clubId, status: 'ACTIVE' },
    });
    const bookedMinutes = completed.reduce((sum, b) => sum + billableMinutes(b.startsAt, b.endsAt), 0);
    const capacityMinutes = activeStations * 14 * 60 * periodDays;
    const occupancyPercent =
      capacityMinutes > 0
        ? Math.round(((bookedMinutes / capacityMinutes) * 100 + Number.EPSILON) * 10) / 10
        : 0;

    const hourBuckets = new Map<number, number>();
    for (const b of bookings) {
      const hour = utcToZonedParts(club.timezone, b.startsAt).hours;
      hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + 1);
    }
    const peakHours = Array.from(hourBuckets.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const stationMap = new Map<number, { stationId: number; label: string; count: number; revenue: number }>();
    for (const b of bookings) {
      const entry = stationMap.get(b.stationId) ?? {
        stationId: b.stationId,
        label: b.station.label,
        count: 0,
        revenue: 0,
      };
      entry.count += 1;
      if (b.status === BookingStatus.COMPLETED) entry.revenue += Number(b.priceAmount);
      stationMap.set(b.stationId, entry);
    }
    const topStations = Array.from(stationMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const leadTimes = bookings.map((b) => (b.startsAt.getTime() - b.createdAt.getTime()) / 3600_000);
    const averageLeadTimeHours = leadTimes.length
      ? Math.round((leadTimes.reduce((s, x) => s + x, 0) / leadTimes.length) * 10) / 10
      : 0;

    return {
      clubId,
      clubName: club.name,
      periodDays,
      from: from.toISOString(),
      to: to.toISOString(),
      bookings: bookings.length,
      completed: completed.length,
      cancelled: cancelled.length,
      revenue,
      occupancyPercent,
      cancellationRate: bookings.length ? Math.round((cancelled.length / bookings.length) * 1000) / 1000 : 0,
      peakHours,
      topStations,
      averageLeadTimeHours,
    };
  }

  // ---------------------------------------------------------------- reads

  async overview(user: AuthUser, clubId: number, periodDays = 30) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    return this.computeClubMetrics(clubId, periodDays);
  }

  async listInsights(user: AuthUser, clubId: number, limit = 20) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    return this.prisma.aiInsight.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
    });
  }

  // ------------------------------------------------------------- generate

  async generateInsight(user: AuthUser, clubId: number, periodDays = 30, kind = 'club_summary') {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const metrics = await this.computeClubMetrics(clubId, periodDays);

    const cfg = this.aiConfig;
    let result;
    if (cfg.provider && cfg.provider !== 'heuristic' && cfg.apiKey) {
      try {
        result = await remoteInsight(cfg, metrics);
      } catch (error) {
        this.logger.warn(
          `AI provider "${cfg.provider}" failed, falling back to heuristic: ${(error as Error).message}`,
        );
        result = heuristicInsight(metrics);
      }
    } else {
      result = heuristicInsight(metrics);
    }

    const insight = await this.prisma.aiInsight.create({
      data: {
        clubId,
        kind,
        periodStart: new Date(metrics.from),
        periodEnd: new Date(metrics.to),
        provider: result.provider,
        model: result.model,
        payload: { metrics, summary: result.summary, recommendations: result.recommendations } as unknown as Prisma.InputJsonValue,
        generatedById: user.id,
      },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'analytics.insight_generated',
      entityType: 'AiInsight',
      entityId: insight.id,
      metadata: { clubId, provider: result.provider, kind },
    });
    return insight;
  }

  // ------------------------------------------------------------ platform

  async platformOverview(user: AuthUser) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Admin only');
    const [clubs, users, bookings, completed] = await this.prisma.$transaction([
      this.prisma.club.count(),
      this.prisma.user.count(),
      this.prisma.booking.count(),
      this.prisma.booking.aggregate({
        where: { status: BookingStatus.COMPLETED },
        _sum: { priceAmount: true },
        _count: true,
      }),
    ]);
    const [activeSubscriptions, commission] = await this.prisma.$transaction([
      this.prisma.clubSubscription.count({ where: { status: { in: ['TRIALING', 'ACTIVE'] } } }),
      this.prisma.commissionLedgerEntry.aggregate({
        where: { status: 'CHARGED' },
        _sum: { commissionAmount: true },
      }),
    ]);
    return {
      clubs,
      users,
      bookings,
      completedBookings: completed._count,
      grossCompletedValue: Number(completed._sum.priceAmount ?? 0n),
      activeSubscriptions,
      chargedCommission: Number(commission._sum.commissionAmount ?? 0n),
    };
  }
}
