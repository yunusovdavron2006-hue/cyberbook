import { PricingRule, PricingUnit, Station } from '@prisma/client';
import { PricingService } from './pricing.service';

function makeRule(overrides: Partial<PricingRule>): PricingRule {
  return {
    id: 1,
    clubId: 1,
    stationId: null,
    categoryId: null,
    name: 'rule',
    priority: 0,
    dayOfWeeks: [],
    startsAtTime: null,
    endsAtTime: null,
    unit: PricingUnit.PER_HOUR,
    amount: 1n,
    active: true,
    ...overrides,
  } as PricingRule;
}

const club = { id: 1, timezone: 'Asia/Tashkent' };
const station: Pick<Station, 'id' | 'categoryId' | 'pricePerHour'> = {
  id: 10,
  categoryId: 2,
  pricePerHour: 25000n,
};

// Monday 12:00 Asia/Tashkent (weekday 0, 720 minutes into the day)
const mondayNoon = new Date('2026-01-05T07:00:00.000Z');

describe('PricingService', () => {
  let findMany: jest.Mock;
  let service: PricingService;

  beforeEach(() => {
    findMany = jest.fn();
    const prisma = { pricingRule: { findMany } } as unknown as ConstructorParameters<typeof PricingService>[0];
    const access = {} as ConstructorParameters<typeof PricingService>[1];
    const audit = { log: jest.fn() } as unknown as ConstructorParameters<typeof PricingService>[2];
    service = new PricingService(prisma, access, audit);
  });

  it('falls back to the station base price when no rule matches', async () => {
    findMany.mockResolvedValue([]);
    const { amount, unit, source, rule } = await service.resolveRate(club, station, mondayNoon);
    expect(source).toBe('BASE_PRICE');
    expect(amount).toBe(25000n);
    expect(unit).toBe(PricingUnit.PER_HOUR);
    expect(rule).toBeNull();
  });

  it('prefers a station-specific rule over a category rule', async () => {
    findMany.mockResolvedValue([
      makeRule({ id: 1, stationId: 10, amount: 40000n, unit: PricingUnit.PER_HOUR }),
      makeRule({ id: 2, categoryId: 2, amount: 30000n, unit: PricingUnit.PER_HOUR }),
    ]);
    const { amount, source } = await service.resolveRate(club, station, mondayNoon);
    expect(source).toBe('STATION_RULE');
    expect(amount).toBe(40000n);
  });

  it('uses a category rule when no station rule matches', async () => {
    findMany.mockResolvedValue([
      makeRule({ id: 2, categoryId: 2, amount: 30000n, unit: PricingUnit.PER_HOUR }),
    ]);
    const { amount, source } = await service.resolveRate(club, station, mondayNoon);
    expect(source).toBe('CATEGORY_RULE');
    expect(amount).toBe(30000n);
  });

  it('skips rules whose local time window does not contain the booking start', async () => {
    findMany.mockResolvedValue([
      makeRule({ id: 1, categoryId: 2, amount: 99999n, startsAtTime: '18:00', endsAtTime: '22:00' }),
    ]);
    const { source, amount } = await service.resolveRate(club, station, mondayNoon);
    expect(source).toBe('BASE_PRICE');
    expect(amount).toBe(25000n);
  });

  it('applies a rule whose time window contains the booking start', async () => {
    findMany.mockResolvedValue([
      makeRule({ id: 1, categoryId: 2, amount: 20000n, startsAtTime: '10:00', endsAtTime: '14:00' }),
    ]);
    const { source, amount } = await service.resolveRate(club, station, mondayNoon);
    expect(source).toBe('CATEGORY_RULE');
    expect(amount).toBe(20000n);
  });

  it('honours day-of-week filters', async () => {
    findMany.mockResolvedValue([
      makeRule({ id: 1, categoryId: 2, amount: 20000n, dayOfWeeks: [5, 6] }), // Sat/Sun only
    ]);
    const { source } = await service.resolveRate(club, station, mondayNoon);
    expect(source).toBe('BASE_PRICE');
  });

  it('computes an hourly total for the whole duration', async () => {
    findMany.mockResolvedValue([]);
    const endsAt = new Date(mondayNoon.getTime() + 2 * 3600 * 1000);
    const { total, snapshot } = await service.computePrice(club, station, mondayNoon, endsAt);
    expect(total).toBe(50000n); // 2h * 25000
    expect(snapshot.minutes).toBe(120);
    expect(snapshot.currency).toBe('UZS');
  });

  it('computes a FLAT-priced total regardless of duration', async () => {
    findMany.mockResolvedValue([
      makeRule({ id: 1, categoryId: 2, amount: 15000n, unit: PricingUnit.FLAT }),
    ]);
    const endsAt = new Date(mondayNoon.getTime() + 3 * 3600 * 1000);
    const { total, snapshot } = await service.computePrice(club, station, mondayNoon, endsAt);
    expect(total).toBe(15000n);
    expect(snapshot.unit).toBe(PricingUnit.FLAT);
    expect(snapshot.source).toBe('CATEGORY_RULE');
  });

  it('rejects a non-positive duration', async () => {
    findMany.mockResolvedValue([]);
    await expect(service.computePrice(club, station, mondayNoon, mondayNoon)).rejects.toThrow();
  });
});
