import { PromotionDiscountType, PromotionLike } from './promotion.util';
import { chooseBestPromotion, discountFor, isPromotionEligible } from './promotion.util';

function promo(overrides: Partial<PromotionLike> = {}): PromotionLike {
  return {
    id: 1,
    type: 'PERCENT',
    value: 10,
    stationId: null,
    categoryId: null,
    dayOfWeeks: [],
    startsAtTime: null,
    endsAtTime: null,
    validFrom: null,
    validUntil: null,
    minDurationMinutes: null,
    priority: 0,
    stackable: false,
    ...overrides,
  };
}

describe('promotion.util', () => {
  describe('discountFor', () => {
    it('computes a whole-percent discount (integer so\'m, floor)', () => {
      expect(discountFor({ type: 'PERCENT', value: 10 }, 100000)).toBe(10000);
      expect(discountFor({ type: 'PERCENT', value: 15 }, 99999)).toBe(14999); // 14999.85 -> floor
    });

    it('accepts bigint values', () => {
      expect(discountFor({ type: 'PERCENT', value: 50n }, 20000)).toBe(10000);
      expect(discountFor({ type: 'FLAT', value: 7500n }, 20000)).toBe(7500);
    });

    it('caps the discount at the subtotal', () => {
      expect(discountFor({ type: 'FLAT', value: 90000 }, 50000)).toBe(50000);
      expect(discountFor({ type: 'PERCENT', value: 100 }, 50000)).toBe(50000);
    });

    it('clamps percent above 100 and non-positive input to 0', () => {
      expect(discountFor({ type: 'PERCENT', value: 150 }, 10000)).toBe(10000);
      expect(discountFor({ type: 'FLAT', value: -500 }, 10000)).toBe(0);
      expect(discountFor({ type: 'PERCENT', value: 10 }, 0)).toBe(0);
      expect(discountFor({ type: 'PERCENT', value: 10 }, -1)).toBe(0);
    });

    it('handles a flat discount larger than 0 but smaller than the subtotal', () => {
      expect(discountFor({ type: 'FLAT', value: 3000 }, 12000)).toBe(3000);
    });
  });

  describe('isPromotionEligible', () => {
    const instant = new Date('2026-01-05T12:00:00.000Z'); // Monday
    const ctx = {
      weekday: 0,
      startMinutes: 12 * 60,
      durationMinutes: 120,
      instant,
      stationId: 7,
      categoryId: 3,
    };

    it('is eligible when no constraints are set', () => {
      expect(isPromotionEligible(promo(), ctx)).toBe(true);
    });

    it('respects the date validity window', () => {
      const before = promo({ validFrom: new Date(instant.getTime() + 1000), validUntil: null });
      expect(isPromotionEligible(before, ctx)).toBe(false);
      const after = promo({ validFrom: null, validUntil: new Date(instant.getTime() - 1000) });
      expect(isPromotionEligible(after, ctx)).toBe(false);
      const within = promo({ validFrom: new Date(instant.getTime() - 1000), validUntil: new Date(instant.getTime() + 1000) });
      expect(isPromotionEligible(within, ctx)).toBe(true);
    });

    it('respects minimum duration', () => {
      expect(isPromotionEligible(promo({ minDurationMinutes: 60 }), ctx)).toBe(true);
      expect(isPromotionEligible(promo({ minDurationMinutes: 180 }), ctx)).toBe(false);
    });

    it('enforces station and category scope', () => {
      expect(isPromotionEligible(promo({ stationId: 7 }), ctx)).toBe(true);
      expect(isPromotionEligible(promo({ stationId: 9 }), ctx)).toBe(false);
      expect(isPromotionEligible(promo({ categoryId: 3 }), ctx)).toBe(true);
      expect(isPromotionEligible(promo({ categoryId: 4 }), ctx)).toBe(false);
    });

    it('enforces day-of-week and time-of-day windows', () => {
      expect(isPromotionEligible(promo({ dayOfWeeks: [0, 1, 2, 3, 4, 5, 6] }), ctx)).toBe(true);
      expect(isPromotionEligible(promo({ dayOfWeeks: [1, 2, 3] }), ctx)).toBe(false);
      expect(isPromotionEligible(promo({ startsAtTime: '10:00', endsAtTime: '14:00' }), ctx)).toBe(true);
      expect(isPromotionEligible(promo({ startsAtTime: '15:00', endsAtTime: '18:00' }), ctx)).toBe(false);
    });

    it('treats an overnight time window correctly (22:00–06:00)', () => {
      const overnight = promo({ startsAtTime: '22:00', endsAtTime: '06:00' });
      expect(isPromotionEligible(overnight, { ...ctx, startMinutes: 23 * 60 })).toBe(true);
      expect(isPromotionEligible(overnight, { ...ctx, startMinutes: 3 * 60 })).toBe(true);
      expect(isPromotionEligible(overnight, { ...ctx, startMinutes: 12 * 60 })).toBe(false);
    });
  });

  describe('chooseBestPromotion', () => {
    const instant = new Date('2026-01-05T12:00:00.000Z');
    const ctx = {
      weekday: 0,
      startMinutes: 12 * 60,
      durationMinutes: 120,
      instant,
      stationId: 1,
      categoryId: 1,
    };
    const type: PromotionDiscountType = 'PERCENT';

    it('returns null when nothing is eligible', () => {
      expect(chooseBestPromotion([], 100000, ctx)).toBeNull();
      expect(chooseBestPromotion([promo({ dayOfWeeks: [5, 6] })], 100000, ctx)).toBeNull();
    });

    it('picks the promotion with the largest discount', () => {
      const big = promo({ id: 1, type: 'PERCENT', value: 20 });
      const small = promo({ id: 2, type: 'PERCENT', value: 10 });
      const best = chooseBestPromotion([small, big], 100000, ctx)!;
      expect(best.promotion.id).toBe(1);
      expect(best.discount).toBe(20000);
    });

    it('breaks ties by priority', () => {
      const lowPriority = promo({ id: 5, value: 10, priority: 0 });
      const highPriority = promo({ id: 9, value: 10, priority: 5 });
      const best = chooseBestPromotion([lowPriority, highPriority], 100000, ctx)!;
      expect(best.promotion.id).toBe(9);
    });

    it('breaks full ties deterministically by smallest id', () => {
      const a = promo({ id: 3, value: 10, priority: 2 });
      const b = promo({ id: 4, value: 10, priority: 2 });
      const best = chooseBestPromotion([b, a], 100000, ctx)!;
      expect(best.promotion.id).toBe(3);
    });

    it('skips eligible promos that discount to zero', () => {
      const free = promo({ id: 1, type, value: 0 });
      const real = promo({ id: 2, type, value: 10 });
      const best = chooseBestPromotion([free, real], 100000, ctx)!;
      expect(best.promotion.id).toBe(2);
    });
  });
});
