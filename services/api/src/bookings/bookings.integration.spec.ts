/**
 * Isolated database integration test for the booking lifecycle.
 *
 * SAFETY: this suite only runs when ALL of the following are true:
 *   - RUN_DB_TESTS === '1'
 *   - TEST_DATABASE_URL is set
 *   - the target database name looks like an isolated test database
 *     (contains "test" and is NOT the main "cyberbook" database)
 * It binds Prisma to that URL explicitly and refuses to run otherwise, so it can
 * never touch the development/production database. Run it with:
 *
 *   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgresql://postgres@localhost:5432/cyberbook_test \
 *     npm run test:integration
 */
import {
  BookingStatus,
  ClubStatus,
  PrismaClient,
  Role,
  StationCategoryKey,
  StationStatus,
  UserStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { BookingsService } from './bookings.service';
import { AvailabilityService } from '../availability/availability.service';
import { PricingService } from '../pricing/pricing.service';
import { ClubAccessService } from '../clubs/club-access.service';
import { ClubScheduleService } from '../common/services/club-schedule.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ConflictException, ForbiddenException } from '../common/exceptions';

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

const pad = (n: number) => String(n).padStart(2, '0');

function freeCovers(free: { startsAt: string; endsAt: string }[], iso: string): boolean {
  const t = new Date(iso).getTime();
  return free.some((f) => new Date(f.startsAt).getTime() <= t && t < new Date(f.endsAt).getTime());
}

/** UTC instant for a club-local wall time (Asia/Tashkent = UTC+5, no DST). */
function tashkent(daysFromNow: number, hour: number, minute = 0): Date {
  const base = new Date(Date.now() + daysFromNow * 86_400_000);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();
  return new Date(Date.UTC(y, m, d, hour - 5, minute, 0, 0));
}

const describeDb = enabled ? describe : describe.skip;

describeDb('Booking lifecycle & concurrency (isolated DB)', () => {
  let prisma: PrismaClient;
  let bookings: BookingsService;
  let availability: AvailabilityService;

  let categoryId: number;
  let clubId: number;
  let stationId: number;
  let owner: AuthUser;
  let customerA: AuthUser;
  let customerB: AuthUser;

  const ownerEmail = `itest-owner-${Date.now()}@test.local`;
  const aEmail = `itest-a-${Date.now()}@test.local`;
  const bEmail = `itest-b-${Date.now()}@test.local`;

  // A club-local day 3 days ahead at 10:00 / 11:00 / 14:00.
  const day3 = new Date(Date.now() + 3 * 86_400_000);
  const localDateStr = `${day3.getUTCFullYear()}-${pad(day3.getUTCMonth() + 1)}-${pad(day3.getUTCDate())}`;
  const ten = tashkent(3, 10);
  const eleven = tashkent(3, 11);
  const twelve = tashkent(3, 12);
  const two = tashkent(3, 14);
  const three = tashkent(3, 15);
  const iso = (d: Date) => d.toISOString();

  beforeAll(async () => {
    expect(targetDbName).not.toBe('cyberbook');

    prisma = new PrismaClient({ datasources: { db: { url: TEST_URL } } });
    const current = await prisma.$queryRawUnsafe<{ current_database: string }[]>(
      'SELECT current_database() AS current_database',
    );
    expect(current[0].current_database).toBe(targetDbName);
    expect(current[0].current_database).not.toBe('cyberbook');

    const prismaAsService = prisma as unknown as PrismaService;
    const access = new ClubAccessService(prismaAsService);
    const schedule = new ClubScheduleService(prismaAsService);
    const audit = { log: () => undefined };
    const pricing = new PricingService(prismaAsService, access, audit as never);
    const notifications = { notify: async () => undefined, notifyClubOwner: async () => undefined };
    const config = {
      get: (key: string) => (key === 'app.booking' ? bookingCfg : undefined),
    } as unknown as ConfigService;

    bookings = new BookingsService(
      prismaAsService,
      config,
      access,
      pricing,
      schedule,
      notifications as never,
      audit as never,
    );
    availability = new AvailabilityService(prismaAsService, schedule);

    const category = await prisma.stationCategory.create({
      data: { key: StationCategoryKey.PC, labelUz: 'PC', labelRu: 'PC', labelEn: 'PC' },
    });
    categoryId = category.id;

    const ownerRow = await prisma.user.create({
      data: { email: ownerEmail, passwordHash: 'x', role: Role.CLUB_OWNER, status: UserStatus.ACTIVE },
    });
    const aRow = await prisma.user.create({
      data: { email: aEmail, passwordHash: 'x', role: Role.USER, status: UserStatus.ACTIVE },
    });
    const bRow = await prisma.user.create({
      data: { email: bEmail, passwordHash: 'x', role: Role.USER, status: UserStatus.ACTIVE },
    });
    owner = { id: ownerRow.id, email: ownerRow.email, role: 'CLUB_OWNER', status: 'ACTIVE' };
    customerA = { id: aRow.id, email: aRow.email, role: 'USER', status: 'ACTIVE' };
    customerB = { id: bRow.id, email: bRow.email, role: 'USER', status: 'ACTIVE' };

    const club = await prisma.club.create({
      data: {
        ownerId: owner.id,
        name: 'ITest Club',
        slug: `itest-club-${Date.now()}`,
        city: 'Tashkent',
        address: 'ITest address',
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

    const station = await prisma.station.create({
      data: {
        clubId,
        categoryId,
        label: 'PC-IT-1',
        status: StationStatus.ACTIVE,
        pricePerHour: 20000n,
      },
    });
    stationId = station.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.maintenanceBlock.deleteMany({ where: { stationId } });
    await prisma.booking.deleteMany({ where: { clubId } });
    await prisma.station.deleteMany({ where: { clubId } });
    await prisma.operatingHours.deleteMany({ where: { clubId } });
    await prisma.club.deleteMany({ where: { id: clubId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, customerA.id, customerB.id] } } });
    await prisma.stationCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('reports the station as available before any booking', async () => {
    const day = await availability.computeDayAvailability(clubId, TZ, localDateStr);
    const station = day.stations.find((s) => s.stationId === stationId);
    expect(station).toBeDefined();
    expect(station!.status).toBe(StationStatus.ACTIVE);
    expect(freeCovers(station!.free, iso(ten))).toBe(true);
  });

  it('creates a booking, prices it server-side and persists it', async () => {
    const booking = await bookings.create(customerA, {
      clubId,
      stationId,
      startsAt: iso(ten),
      endsAt: iso(eleven),
    });
    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(booking.priceAmount).toBe(20000);
    expect(booking.reference).toMatch(/^CB-/);

    const fetched = await bookings.getOne(customerA, booking.id);
    expect(fetched.id).toBe(booking.id);

    const persisted = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(persisted?.reference).toBe(booking.reference);
  });

  it('no longer offers the booked interval, but still offers adjacent time', async () => {
    const day = await availability.computeDayAvailability(clubId, TZ, localDateStr);
    const station = day.stations.find((s) => s.stationId === stationId)!;
    expect(freeCovers(station.free, iso(ten))).toBe(false);
    expect(freeCovers(station.free, iso(eleven))).toBe(true);
  });

  it('rejects an overlapping booking with 409 SLOT_TAKEN', async () => {
    await expect(
      bookings.create(customerB, {
        clubId,
        stationId,
        startsAt: iso(new Date(ten.getTime() + 30 * 60_000)),
        endsAt: iso(new Date(eleven.getTime() + 30 * 60_000)),
      }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/already booked/i) });
  });

  it('allows an adjacent, non-overlapping booking', async () => {
    const adjacent = await bookings.create(customerB, {
      clubId,
      stationId,
      startsAt: iso(eleven),
      endsAt: iso(twelve),
    });
    expect(adjacent.status).toBe(BookingStatus.CONFIRMED);
  });

  it('rejects a booking outside opening hours', async () => {
    await expect(
      bookings.create(customerB, {
        clubId,
        stationId,
        startsAt: iso(tashkent(3, 7)),
        endsAt: iso(tashkent(3, 8)),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets only one of two concurrent overlapping requests win', async () => {
    const results = await Promise.allSettled([
      bookings.create(customerA, { clubId, stationId, startsAt: iso(two), endsAt: iso(three) }),
      bookings.create(customerB, { clubId, stationId, startsAt: iso(two), endsAt: iso(three) }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const reason = (failed[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(ConflictException);
    expect((reason as ConflictException).getStatus()).toBe(409);
  });

  it('blocks the station while maintenance is scheduled', async () => {
    const from = tashkent(3, 16);
    const to = tashkent(3, 17);
    const block = await prisma.maintenanceBlock.create({
      data: { stationId, startsAt: from, endsAt: to, reason: 'itest' },
    });
    const day = await availability.computeDayAvailability(clubId, TZ, localDateStr);
    const station = day.stations.find((s) => s.stationId === stationId)!;
    expect(freeCovers(station.free, iso(from))).toBe(false);
    await prisma.maintenanceBlock.delete({ where: { id: block.id } });
  });

  it('cancels a booking and releases the slot again', async () => {
    const booking = await bookings.create(customerA, {
      clubId,
      stationId,
      startsAt: iso(two),
      endsAt: iso(three),
      idempotencyKey: `itest-${Date.now()}`,
    }).catch(async () => {
      // If the concurrent test already took this slot, book a fresh window instead.
      const b = await bookings.create(customerA, {
        clubId,
        stationId,
        startsAt: tashkent(3, 18).toISOString(),
        endsAt: tashkent(3, 19).toISOString(),
      });
      return b;
    });
    const cancelled = await bookings.cancel(customerA, booking.id, { reason: 'itest cancel' });
    expect(cancelled.status).toBe(BookingStatus.CANCELLED);

    const day = await availability.computeDayAvailability(clubId, TZ, localDateStr);
    const station = day.stations.find((s) => s.stationId === stationId)!;
    const startIso = booking.startsAt instanceof Date ? booking.startsAt.toISOString() : String(booking.startsAt);
    expect(freeCovers(station.free, startIso)).toBe(true);
  });

  it('enforces ownership on cancellation', async () => {
    const booking = await bookings.create(customerA, {
      clubId,
      stationId,
      startsAt: iso(tashkent(3, 19)),
      endsAt: iso(tashkent(3, 20)),
    });
    await expect(bookings.cancel(customerB, booking.id, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces owner-only access to the club dashboard', async () => {
    const dash = await bookings.clubDashboard(owner, clubId);
    expect(dash.club.id).toBe(clubId);
    expect(dash.totalStations).toBeGreaterThan(0);
    await expect(bookings.clubDashboard(customerB, clubId)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
