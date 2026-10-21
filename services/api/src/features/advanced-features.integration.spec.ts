/**
 * Isolated database integration test for the advanced business features:
 * promotions, loyalty/referrals, commissions, group bookings and QR check-in.
 *
 * SAFETY: identical guard to bookings.integration.spec.ts — only runs when
 *   RUN_DB_TESTS === '1', TEST_DATABASE_URL is set and points at an isolated
 *   database whose name contains "test" (and is not "cyberbook").
 *
 *   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgresql://postgres@localhost:5432/cyberbook_test \
 *     npm run test:integration
 */
import {
  BookingStatus,
  ClubStatus,
  CommissionStatus,
  GroupBookingStatus,
  LoyaltyEntryType,
  PrismaClient,
  PromotionType,
  ReferralStatus,
  Role,
  StationCategoryKey,
  StationStatus,
  UserStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { ClubScheduleService } from '../common/services/club-schedule.service';
import { PricingService } from '../pricing/pricing.service';
import { PromotionsService } from '../promotions/promotions.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReferralService } from '../loyalty/referral.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { CommissionsService } from '../subscriptions/commissions.service';
import { BookingsService } from '../bookings/bookings.service';
import { CheckInService } from '../checkin/checkin.service';
import { GroupBookingsService } from '../groups/group-bookings.service';
import { ApiException } from '../common/exceptions';
import { AuthUser } from '../common/decorators/current-user.decorator';

const RUN = process.env.RUN_DB_TESTS === '1';
const TEST_URL = process.env.TEST_DATABASE_URL ?? '';
const targetDbName = TEST_URL.split('/').pop()?.split('?')[0] ?? '';
const ISOLATED = /test/i.test(targetDbName) && targetDbName !== 'cyberbook';
const enabled = RUN && ISOLATED && TEST_URL.length > 0;

const TZ = 'Asia/Tashkent';

const bookingCfg = {
  pendingTtlMinutes: 15,
  cancellationDeadlineMinutes: 30,
  minDurationMinutes: 30,
  maxDurationMinutes: 720,
  leadTimeMinutes: 0,
  bufferMinutes: 0,
  autoConfirm: true,
  maxHorizonDays: 30,
};

const featuresCfg = {
  loyaltyEarnPointsPerHour: 10,
  referralRewardPoints: 500,
  refereeBonusPoints: 100,
  checkInTokenTtlHours: 24,
  defaultCommissionBps: 500,
  ai: { provider: 'heuristic', model: 'test', apiKey: null, baseUrl: null },
};

/** UTC instant for a club-local wall time (Asia/Tashkent = UTC+5, no DST). */
function tashkent(daysFromNow: number, hour: number, minute = 0): Date {
  const base = new Date(Date.now() + daysFromNow * 86_400_000);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();
  return new Date(Date.UTC(y, m, d, hour - 5, minute, 0, 0));
}

const describeDb = enabled ? describe : describe.skip;

describeDb('Advanced features (isolated DB)', () => {
  let prisma: PrismaClient;
  let prismaAsService: PrismaService;
  let promotions: PromotionsService;
  let loyalty: LoyaltyService;
  let referrals: ReferralService;
  let subscriptions: SubscriptionsService;
  let commissions: CommissionsService;
  let bookings: BookingsService;
  let checkin: CheckInService;
  let groups: GroupBookingsService;

  let categoryId: number;
  let clubId: number;
  let station1: number;
  let station2: number;
  let owner: AuthUser;
  let admin: AuthUser;
  let customerA: AuthUser;
  let customerB: AuthUser;

  const stamp = Date.now();
  const ownerEmail = `af-owner-${stamp}@test.local`;
  const adminEmail = `af-admin-${stamp}@test.local`;
  const aEmail = `af-a-${stamp}@test.local`;
  const bEmail = `af-b-${stamp}@test.local`;

  const iso = (d: Date) => d.toISOString();
  const two = tashkent(3, 10);
  const twoEnd = tashkent(3, 12);
  const twelveEnd = tashkent(3, 13);
  const four = tashkent(3, 14);
  const fourEnd = tashkent(3, 16);
  const six = tashkent(3, 18);
  const sixEnd = tashkent(3, 20);
  const eight = tashkent(3, 20);
  const eightEnd = tashkent(3, 21);

  beforeAll(async () => {
    expect(targetDbName).not.toBe('cyberbook');
    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
    const current = await prisma.$queryRawUnsafe<{ current_database: string }[]>(
      'SELECT current_database() AS current_database',
    );
    expect(current[0].current_database).toBe(targetDbName);

    prismaAsService = prisma as unknown as PrismaService;
    const access = new ClubAccessService(prismaAsService);
    const schedule = new ClubScheduleService(prismaAsService);
    const audit = { log: () => undefined };
    const notifications = {
      notify: async () => undefined,
      notifyClubOwner: async () => undefined,
    };
    const config = {
      get: (key: string) => {
        if (key === 'app.booking') return bookingCfg;
        if (key === 'app.features') return featuresCfg;
        return undefined;
      },
    } as unknown as ConfigService;

    const pricing = new PricingService(prismaAsService, access, audit as never);
    promotions = new PromotionsService(prismaAsService, access, audit as never);
    loyalty = new LoyaltyService(prismaAsService, config, notifications as never, audit as never);
    referrals = new ReferralService(prismaAsService, config, loyalty, notifications as never, audit as never);
    subscriptions = new SubscriptionsService(prismaAsService, access, config, audit as never);
    commissions = new CommissionsService(prismaAsService, access, subscriptions, audit as never);
    bookings = new BookingsService(
      prismaAsService,
      config,
      access,
      pricing,
      schedule,
      notifications as never,
      audit as never,
      promotions,
      loyalty,
      referrals,
      commissions,
    );
    checkin = new CheckInService(prismaAsService, access, config, audit as never, bookings);
    groups = new GroupBookingsService(
      prismaAsService,
      access,
      pricing,
      promotions,
      schedule,
      config,
      notifications as never,
      audit as never,
    );

    const category = await prisma.stationCategory.create({
      data: { key: StationCategoryKey.PC, labelUz: 'PC', labelRu: 'PC', labelEn: 'PC' },
    });
    categoryId = category.id;

    const ownerRow = await prisma.user.create({
      data: { email: ownerEmail, passwordHash: 'x', role: Role.CLUB_OWNER, status: UserStatus.ACTIVE },
    });
    const adminRow = await prisma.user.create({
      data: { email: adminEmail, passwordHash: 'x', role: Role.ADMIN, status: UserStatus.ACTIVE },
    });
    const aRow = await prisma.user.create({
      data: { email: aEmail, passwordHash: 'x', role: Role.USER, status: UserStatus.ACTIVE },
    });
    const bRow = await prisma.user.create({
      data: { email: bEmail, passwordHash: 'x', role: Role.USER, status: UserStatus.ACTIVE },
    });
    owner = { id: ownerRow.id, email: ownerRow.email, role: 'CLUB_OWNER', status: 'ACTIVE' };
    admin = { id: adminRow.id, email: adminRow.email, role: 'ADMIN', status: 'ACTIVE' };
    customerA = { id: aRow.id, email: aRow.email, role: 'USER', status: 'ACTIVE' };
    customerB = { id: bRow.id, email: bRow.email, role: 'USER', status: 'ACTIVE' };

    const club = await prisma.club.create({
      data: {
        ownerId: owner.id,
        name: 'Advanced Features ITest Club',
        slug: `af-club-${stamp}`,
        city: 'Tashkent',
        address: 'AF address',
        latitude: 41.31,
        longitude: 69.24,
        status: ClubStatus.APPROVED,
        timezone: TZ,
      },
    });
    clubId = club.id;

    await prisma.operatingHours.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        clubId,
        dayOfWeek,
        closed: false,
        opensAt: '08:00',
        closesAt: '22:00',
      })),
    });

    const s1 = await prisma.station.create({
      data: { clubId, categoryId, label: 'AF-PC-1', status: StationStatus.ACTIVE, pricePerHour: 20000n },
    });
    const s2 = await prisma.station.create({
      data: { clubId, categoryId, label: 'AF-PC-2', status: StationStatus.ACTIVE, pricePerHour: 20000n },
    });
    station1 = s1.id;
    station2 = s2.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.commissionLedgerEntry.deleteMany({ where: { clubId } });
      await prisma.clubSubscription.deleteMany({ where: { clubId } });
      await prisma.loyaltyLedgerEntry.deleteMany({
        where: { userId: { in: [owner.id, admin.id, customerA.id, customerB.id] } },
      });
      await prisma.referral.deleteMany({ where: { referrerUserId: { in: [customerA.id, customerB.id] } } });
      await prisma.referralCode.deleteMany({ where: { userId: { in: [customerA.id, customerB.id] } } });
      await prisma.promotionRedemption.deleteMany({ where: { clubId } });
      await prisma.promotion.deleteMany({ where: { clubId } });
      await prisma.bookingEvent.deleteMany({ where: { booking: { clubId } } });
      await prisma.checkInToken.deleteMany({ where: { booking: { clubId } } });
      await prisma.groupBookingParticipant.deleteMany({ where: { group: { clubId } } });
      await prisma.booking.deleteMany({ where: { clubId } });
      await prisma.groupBooking.deleteMany({ where: { clubId } });
      await prisma.subscriptionPlan.deleteMany({ where: { key: { startsWith: `af-${stamp}` } } });
      await prisma.station.deleteMany({ where: { clubId } });
      await prisma.operatingHours.deleteMany({ where: { clubId } });
      await prisma.club.deleteMany({ where: { id: clubId } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner.id, admin.id, customerA.id, customerB.id] } },
      });
      await prisma.stationCategory.deleteMany({ where: { id: categoryId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  describe('smart pricing & promotions', () => {
    it('creates a coded percent promotion', async () => {
      const promo = await promotions.create(owner, clubId, {
        code: 'SAVE10',
        name: 'Save 10%',
        type: PromotionType.PERCENT,
        value: 10,
      });
      expect(promo.code).toBe('SAVE10');
      expect(promo.id).toBeGreaterThan(0);
    });

    it('applies the promotion code server-side and records the redemption', async () => {
      const booking = await bookings.create(customerA, {
        clubId,
        stationId: station1,
        startsAt: iso(two),
        endsAt: iso(twoEnd),
        promoCode: 'save10',
      });
      // base 40 000 (2h @ 20 000) minus 10% = 36 000
      expect(booking.priceAmount).toBe(36000);

      const redemption = await prisma.promotionRedemption.findFirst({
        where: { bookingId: booking.id },
      });
      expect(redemption).not.toBeNull();
      expect(Number(redemption!.discountAmount)).toBe(4000);
      expect(redemption!.code).toBe('SAVE10');
    });

    it('rejects a supplied but unknown promo code', async () => {
      await expect(
        bookings.create(customerA, {
          clubId,
          stationId: station1,
          startsAt: iso(twoEnd),
          endsAt: iso(twelveEnd),
          promoCode: 'NOPE404',
        }),
      ).rejects.toBeInstanceOf(ApiException);
    });
  });

  describe('loyalty + commission on completion', () => {
    it('awards loyalty points and records a commission when a booking completes', async () => {
      const booking = await bookings.create(customerA, {
        clubId,
        stationId: station1,
        startsAt: iso(four),
        endsAt: iso(fourEnd),
      });
      expect(booking.priceAmount).toBe(40000);

      await bookings.updateStatus(owner, booking.id, { status: BookingStatus.COMPLETED });

      const earned = await prisma.loyaltyLedgerEntry.findFirst({
        where: { bookingId: booking.id, type: LoyaltyEntryType.EARN },
      });
      expect(earned).not.toBeNull();
      // 120 minutes at 10 points/hour = 20 points
      expect(earned!.points).toBe(20);

      const commission = await prisma.commissionLedgerEntry.findFirst({
        where: { bookingId: booking.id },
      });
      expect(commission).not.toBeNull();
      expect(commission!.rateBps).toBe(500);
      // 40 000 * 5% = 2 000
      expect(Number(commission!.commissionAmount)).toBe(2000);
      expect(commission!.status).toBe(CommissionStatus.PENDING);
    });

    it('does not double-award on a retried completion hook', async () => {
      const booking = await prisma.booking.findFirst({
        where: { clubId, status: BookingStatus.COMPLETED, startsAt: four },
      });
      expect(booking).not.toBeNull();

      await loyalty.awardBookingCompletion(prismaAsService, {
        id: booking!.id,
        userId: booking!.userId,
        startsAt: booking!.startsAt,
        endsAt: booking!.endsAt,
      });
      await commissions.recordForBooking(prismaAsService, {
        id: booking!.id,
        clubId,
        priceAmount: booking!.priceAmount,
      });

      const ledgerCount = await prisma.loyaltyLedgerEntry.count({
        where: { bookingId: booking!.id, type: LoyaltyEntryType.EARN },
      });
      const commissionCount = await prisma.commissionLedgerEntry.count({
        where: { bookingId: booking!.id },
      });
      expect(ledgerCount).toBe(1);
      expect(commissionCount).toBe(1);
    });
  });

  describe('loyalty redemption', () => {
    it('redeems points and refuses to overdraw', async () => {
      const before = await loyalty.balanceOf(prismaAsService, customerA.id);
      expect(before).toBeGreaterThanOrEqual(20);

      const result = await loyalty.redeem(customerA, { points: 10, idempotencyKey: `af-redeem-${stamp}` });
      expect(result.pointsSpent).toBe(10);
      expect(result.balance).toBe(before - 10);

      await expect(
        loyalty.redeem(customerA, { points: 10_000_000, idempotencyKey: `af-redeem-over-${stamp}` }),
      ).rejects.toBeInstanceOf(ApiException);
    });
  });

  describe('referral rewards', () => {
    it('credits the referee immediately and the referrer after a completed booking', async () => {
      const mine = await referrals.myCode(customerA);
      expect(mine.code).toHaveLength(8);

      const applied = await referrals.apply(customerB, { code: mine.code });
      expect(applied.status).toBe(ReferralStatus.PENDING);

      const bAfterApply = await loyalty.balanceOf(prismaAsService, customerB.id);
      expect(bAfterApply).toBe(featuresCfg.refereeBonusPoints);

      const booking = await bookings.create(customerB, {
        clubId,
        stationId: station1,
        startsAt: iso(twoEnd),
        endsAt: iso(twelveEnd),
      });
      await bookings.updateStatus(owner, booking.id, { status: BookingStatus.COMPLETED });

      const referral = await prisma.referral.findUnique({ where: { referredUserId: customerB.id } });
      expect(referral).not.toBeNull();
      expect(referral!.status).toBe(ReferralStatus.REWARDED);
      expect(referral!.rewardPoints).toBe(featuresCfg.referralRewardPoints);

      const aBalance = await loyalty.balanceOf(prismaAsService, customerA.id);
      expect(aBalance).toBeGreaterThanOrEqual(featuresCfg.referralRewardPoints);
    });
  });

  describe('subscription plans & commissions', () => {
    it('uses the default platform rate, then the plan rate after subscribing', async () => {
      const before = await subscriptions.commissionRateForClub(clubId);
      expect(before.source).toBe('DEFAULT');
      expect(before.bps).toBe(featuresCfg.defaultCommissionBps);

      await subscriptions.createPlan(admin, {
        key: `af-${stamp}-pro`,
        name: 'AF Pro',
        priceAmount: 299000,
        commissionBps: 250,
      });
      await subscriptions.subscribe(owner, clubId, { planKey: `af-${stamp}-pro` });

      const after = await subscriptions.commissionRateForClub(clubId);
      expect(after.source).toBe('PLAN');
      expect(after.bps).toBe(250);
    });
  });

  describe('group bookings', () => {
    it('reserves several stations atomically and totals the price', async () => {
      const group = await groups.create(customerA, {
        clubId,
        startsAt: iso(six),
        endsAt: iso(sixEnd),
        stationIds: [station1, station2],
      });
      expect(group.reference).toMatch(/^GRP-/);
      expect(group.status).toBe(GroupBookingStatus.CONFIRMED);
      expect(group.bookings).toHaveLength(2);
      // 2 stations * 2h * 20 000 = 80 000
      expect(group.totalAmount).toBe(80000);

      const mine = await groups.listMine(customerA);
      expect(mine.some((g) => g.id === group.id)).toBe(true);

      const cancelled = await groups.cancel(customerA, group.id, 'test cleanup');
      expect(cancelled.status).toBe(GroupBookingStatus.CANCELLED);

      const remaining = await prisma.booking.count({
        where: { groupId: group.id, status: BookingStatus.CONFIRMED },
      });
      expect(remaining).toBe(0);
    });
  });

  describe('QR check-in', () => {
    it('issues a single-use token and completes the booking once', async () => {
      const booking = await bookings.create(customerA, {
        clubId,
        stationId: station1,
        startsAt: iso(eight),
        endsAt: iso(eightEnd),
      });

      const issued = await checkin.issue(customerA, booking.id);
      expect(issued.token.length).toBeGreaterThanOrEqual(40);
      expect(issued.qrPayload).toContain(issued.token);

      const resolved = await checkin.resolve(owner, issued.token);
      expect(resolved.bookingId).toBe(booking.id);

      const consumed = await checkin.consume(owner, issued.token);
      expect(consumed.checkIn).toBe(true);
      expect(consumed.booking.status).toBe(BookingStatus.COMPLETED);

      await expect(checkin.consume(owner, issued.token)).rejects.toBeInstanceOf(ApiException);
    });
  });
});
