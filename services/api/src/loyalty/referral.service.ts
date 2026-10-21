import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoyaltyEntryType, Prisma, Referral, ReferralStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ApiException, ConflictException, NotFoundException } from '../common/exceptions';
import { referralCodeFromBytes } from '../common/utils/loyalty.util';
import { LoyaltyService } from './loyalty.service';
import { ApplyReferralDto } from './dto/loyalty.dto';

type Db = Prisma.TransactionClient;

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly loyalty: LoyaltyService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private get features() {
    return this.config.get('app.features') as {
      referralRewardPoints: number;
      refereeBonusPoints: number;
    };
  }

  /** Get (or lazily create) the caller's personal referral code. */
  async getOrCreateCode(userId: number) {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } });
    if (existing) return existing;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = referralCodeFromBytes(randomBytes(10), 8);
      try {
        return await this.prisma.referralCode.create({ data: { userId, code } });
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
    throw new ApiException('Could not allocate a referral code, please retry');
  }

  async myCode(user: AuthUser) {
    const code = await this.getOrCreateCode(user.id);
    const [invited, rewarded] = await this.prisma.$transaction([
      this.prisma.referral.count({ where: { referrerUserId: user.id } }),
      this.prisma.referral.count({ where: { referrerUserId: user.id, status: ReferralStatus.REWARDED } }),
    ]);
    return {
      code: code.code,
      active: code.active,
      invited,
      rewarded,
      rewardPoints: this.features.referralRewardPoints,
      refereeBonusPoints: this.features.refereeBonusPoints,
      shareUrl: `/register?ref=${code.code}`,
    };
  }

  async listMine(userId: number) {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: { referred: { select: { id: true, profile: { select: { displayName: true } } } } },
    });
    return referrals.map((r) => ({
      id: r.id,
      status: r.status,
      rewardPoints: r.rewardPoints,
      createdAt: r.createdAt,
      rewardedAt: r.rewardedAt,
      referredName: r.referred.profile?.displayName ?? 'CyberBook user',
    }));
  }

  /**
   * A newly registered user applies someone else's code. Self-referral and
   * double-referral are rejected. The referee gets an immediate welcome bonus;
   * the referrer is rewarded once the referee completes their first booking.
   */
  async apply(user: AuthUser, dto: ApplyReferralDto) {
    const code = dto.code.trim().toUpperCase();
    const owner = await this.prisma.referralCode.findUnique({ where: { code } });
    if (!owner || !owner.active) throw new NotFoundException('Referral code not found');
    if (owner.userId === user.id) throw new ApiException('You cannot refer yourself');

    const already = await this.prisma.referral.findUnique({ where: { referredUserId: user.id } });
    if (already) throw new ConflictException('You have already applied a referral code', 'ALREADY_REFERRED');

    const referral = await this.prisma.$transaction(async (tx) => {
      const created = await tx.referral.create({
        data: {
          referrerUserId: owner.userId,
          referredUserId: user.id,
          code,
          status: ReferralStatus.PENDING,
        },
      });
      await this.loyalty.awardPoints(tx, {
        userId: user.id,
        type: LoyaltyEntryType.EARN,
        points: this.features.refereeBonusPoints,
        reason: 'Welcome referral bonus',
        referralId: created.id,
        idempotencyKey: `referral-referee:${created.id}`,
      });
      return created;
    });

    await this.notifications.notify({
      userId: owner.userId,
      type: 'REFERRAL_REWARDED',
      title: 'Someone used your referral code',
      body: 'You will be rewarded when they complete their first booking.',
      data: { referralId: referral.id },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'referral.applied',
      entityType: 'Referral',
      entityId: referral.id,
      metadata: { referrerUserId: owner.userId, code },
    });
    return { id: referral.id, status: referral.status, refereeBonusPoints: this.features.refereeBonusPoints };
  }

  /**
   * Called when a booking completes. Qualifies and rewards the referrer the
   * first time a referred user completes a booking. Idempotent via ledger keys.
   */
  async onBookingCompleted(client: Db, referredUserId: number, bookingId: number): Promise<Referral | null> {
    const referral = await client.referral.findUnique({ where: { referredUserId } });
    if (!referral) return null;

    if (referral.status === ReferralStatus.PENDING) {
      const qualified = await client.referral.update({
        where: { id: referral.id },
        data: { status: ReferralStatus.QUALIFIED, qualifyingBookingId: bookingId, qualifiedAt: new Date() },
      });
      referral.status = qualified.status;
    }

    if (referral.status === ReferralStatus.QUALIFIED) {
      const reward = this.features.referralRewardPoints;
      await this.loyalty.awardPoints(client, {
        userId: referral.referrerUserId,
        type: LoyaltyEntryType.EARN,
        points: reward,
        reason: 'Referral reward',
        referralId: referral.id,
        idempotencyKey: `referral-reward:${referral.id}`,
      });
      const rewarded = await client.referral.update({
        where: { id: referral.id },
        data: { status: ReferralStatus.REWARDED, rewardedAt: new Date(), rewardPoints: reward },
      });
      return rewarded;
    }

    return referral;
  }

  /** Post-commit notification for a rewarded referrer (kept out of the tx). */
  async notifyReward(referral: Referral) {
    await this.notifications.notify({
      userId: referral.referrerUserId,
      type: 'REFERRAL_REWARDED',
      title: 'Referral reward earned',
      body: `You earned ${referral.rewardPoints} points from a referral.`,
      data: { referralId: referral.id },
    });
  }
}
