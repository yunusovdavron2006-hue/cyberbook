import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ClubSubscription,
  Prisma,
  Role,
  SubscriptionBillingPeriod,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ConflictException, ForbiddenException, NotFoundException } from '../common/exceptions';
import {
  CreateSubscriptionPlanDto,
  SubscribeDto,
  UpdateSubscriptionPlanDto,
} from './dto/subscriptions.dto';

const PERIOD_DAYS: Record<SubscriptionBillingPeriod, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  YEARLY: 365,
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClubAccessService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private serializePlanMoney(plan: SubscriptionPlan) {
    return { ...plan, priceAmount: Number(plan.priceAmount) };
  }

  // ------------------------------------------------------------------ plans

  async listPlans(activeOnly = true) {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return plans.map((p) => this.serializePlanMoney(p));
  }

  async createPlan(user: AuthUser, dto: CreateSubscriptionPlanDto) {
    this.assertAdmin(user);
    const existing = await this.prisma.subscriptionPlan.findUnique({ where: { key: dto.key } });
    if (existing) throw new ConflictException('A plan with this key already exists', 'PLAN_EXISTS');
    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        key: dto.key,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        priceAmount: BigInt(dto.priceAmount),
        billingPeriod: dto.billingPeriod ?? SubscriptionBillingPeriod.MONTHLY,
        commissionBps: dto.commissionBps,
        maxStations: dto.maxStations ?? null,
        features: (dto.features ?? undefined) as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'subscription_plan.created',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
      metadata: { key: plan.key, commissionBps: plan.commissionBps },
    });
    return this.serializePlanMoney(plan);
  }

  async updatePlan(user: AuthUser, planId: number, dto: UpdateSubscriptionPlanDto) {
    this.assertAdmin(user);
    const existing = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!existing) throw new NotFoundException('Plan not found');
    const plan = await this.prisma.subscriptionPlan.update({
      where: { id: planId },
      data: {
        key: dto.key,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        priceAmount: BigInt(dto.priceAmount),
        billingPeriod: dto.billingPeriod ?? existing.billingPeriod,
        commissionBps: dto.commissionBps,
        maxStations: dto.maxStations ?? null,
        features: (dto.features ?? undefined) as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        active: dto.active ?? existing.active,
      },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'subscription_plan.updated',
      entityType: 'SubscriptionPlan',
      entityId: plan.id,
    });
    return this.serializePlanMoney(plan);
  }

  // ----------------------------------------------------------- subscriptions

  async listForClub(user: AuthUser, clubId: number) {
    await this.access.assertOperatorOrAdmin(clubId, user);
    const subs = await this.prisma.clubSubscription.findMany({
      where: { clubId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    return subs.map((s) => ({ ...s, plan: this.serializePlanMoney(s.plan) }));
  }

  async currentForClub(clubId: number) {
    const sub = await this.prisma.clubSubscription.findFirst({
      where: {
        clubId,
        status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return null;
    return { ...sub, plan: this.serializePlanMoney(sub.plan) };
  }

  private async activePlan(clubId: number) {
    const sub = await this.currentForClub(clubId);
    return sub?.plan ?? null;
  }

  /** Commission rate (bps) that applies to a club's bookings right now. */
  async commissionRateForClub(clubId: number): Promise<{ bps: number; source: 'PLAN' | 'DEFAULT'; planKey: string | null }> {
    const plan = await this.activePlan(clubId);
    if (plan) return { bps: plan.commissionBps, source: 'PLAN', planKey: plan.key };
    const features = this.config.get('app.features') as { defaultCommissionBps: number };
    return { bps: features.defaultCommissionBps, source: 'DEFAULT', planKey: null };
  }

  async subscribe(user: AuthUser, clubId: number, dto: SubscribeDto) {
    await this.access.assertOwnerOrAdmin(clubId, user);

    const existing = await this.prisma.clubSubscription.findFirst({
      where: {
        clubId,
        status: { in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
      },
    });
    if (existing) {
      throw new ConflictException('This club already has an active subscription', 'SUBSCRIPTION_EXISTS');
    }

    const plan = dto.planId
      ? await this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } })
      : dto.planKey
        ? await this.prisma.subscriptionPlan.findUnique({ where: { key: dto.planKey } })
        : null;
    if (!plan || !plan.active) throw new NotFoundException('Subscription plan not found or inactive');

    const now = new Date();
    const trialDays = dto.trialDays ?? 0;
    const status = trialDays > 0 ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE;
    const periodStart = trialDays > 0 ? new Date(now.getTime() + trialDays * 86_400_000) : now;
    const currentPeriodEnd = new Date(
      periodStart.getTime() + PERIOD_DAYS[plan.billingPeriod] * 86_400_000,
    );

    try {
      const subscription = await this.prisma.clubSubscription.create({
        data: {
          clubId,
          planId: plan.id,
          status,
          startsAt: now,
          currentPeriodEnd,
          trialEndsAt: trialDays > 0 ? periodStart : null,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
        include: { plan: true },
      });
      this.audit.log({
        actorUserId: user.id,
        action: 'club_subscription.created',
        entityType: 'ClubSubscription',
        entityId: subscription.id,
        metadata: { clubId, planKey: plan.key, status },
      });
      return { ...subscription, plan: this.serializePlanMoney(subscription.plan) };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' && dto.idempotencyKey) {
        const found = await this.prisma.clubSubscription.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: { plan: true },
        });
        if (found) return { ...found, plan: this.serializePlanMoney(found.plan) };
      }
      throw error;
    }
  }

  async cancel(user: AuthUser, clubId: number, subscriptionId: number) {
    await this.access.assertOwnerOrAdmin(clubId, user);
    const sub = await this.prisma.clubSubscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.clubId !== clubId) throw new NotFoundException('Subscription not found');
    if (sub.status === SubscriptionStatus.CANCELLED) {
      return { ...sub, alreadyCancelled: true };
    }
    const updated = await this.prisma.clubSubscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'club_subscription.cancelled',
      entityType: 'ClubSubscription',
      entityId: subscriptionId,
      metadata: { clubId },
    });
    return updated;
  }

  /** Verify the club's station count is within its plan's limit (used by callers). */
  async assertWithinPlanLimits(clubId: number): Promise<void> {
    const plan = await this.activePlan(clubId);
    if (!plan || plan.maxStations == null) return;
    const count = await this.prisma.station.count({ where: { clubId } });
    if (count > plan.maxStations) {
      throw new ForbiddenException(
        `Your plan allows up to ${plan.maxStations} stations. Upgrade to add more.`,
      );
    }
  }

  private assertAdmin(user: AuthUser) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Admin only');
  }
}

export type ClubSubscriptionWithPlan = ClubSubscription & { plan: SubscriptionPlan };
