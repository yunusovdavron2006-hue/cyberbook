/**
 * Pure, dependency-free promotion math and eligibility rules.
 *
 * Kept side-effect free so it can be exhaustively unit-tested without a
 * database. All money is integer so'm (UZS); no floats in results.
 */

export type PromotionDiscountType = 'PERCENT' | 'FLAT';

export interface PromotionLike {
  id: number;
  type: PromotionDiscountType;
  /** PERCENT → whole percent (1..100); FLAT → integer UZS */
  value: bigint | number;
  stationId: number | null;
  categoryId: number | null;
  /** Empty = every day. 0 = Monday … 6 = Sunday */
  dayOfWeeks: number[];
  startsAtTime: string | null;
  endsAtTime: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  minDurationMinutes: number | null;
  priority: number;
  stackable: boolean;
}

export interface PromotionContext {
  /** 0 = Monday … 6 = Sunday, in the club timezone */
  weekday: number;
  /** Minutes since local midnight of the booking start */
  startMinutes: number;
  /** Booking duration in minutes */
  durationMinutes: number;
  /** The instant the promotion is evaluated against (usually booking start) */
  instant: Date;
  stationId: number;
  categoryId: number;
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function matchesDayTime(promo: PromotionLike, ctx: PromotionContext): boolean {
  if (promo.dayOfWeeks.length > 0 && !promo.dayOfWeeks.includes(ctx.weekday)) return false;
  if (!promo.startsAtTime || !promo.endsAtTime) return true;
  const start = toMinutes(promo.startsAtTime);
  const end = toMinutes(promo.endsAtTime);
  if (start <= end) return ctx.startMinutes >= start && ctx.startMinutes < end;
  // overnight window
  return ctx.startMinutes >= start || ctx.startMinutes < end;
}

/** Time, scope and duration eligibility (usage caps are enforced separately). */
export function isPromotionEligible(promo: PromotionLike, ctx: PromotionContext): boolean {
  if (promo.validFrom && ctx.instant.getTime() < promo.validFrom.getTime()) return false;
  if (promo.validUntil && ctx.instant.getTime() > promo.validUntil.getTime()) return false;
  if (promo.minDurationMinutes != null && ctx.durationMinutes < promo.minDurationMinutes) return false;

  // Scope: a promotion may target a station, a category, or the whole club.
  // It applies only if it targets nothing, or targets this exact station/category.
  const targetsStation = promo.stationId != null;
  const targetsCategory = promo.categoryId != null;
  if (targetsStation && promo.stationId !== ctx.stationId) return false;
  if (targetsCategory && promo.categoryId !== ctx.categoryId) return false;

  return matchesDayTime(promo, ctx);
}

/** Discount in UZS, never exceeding the subtotal and never negative. */
export function discountFor(promo: Pick<PromotionLike, 'type' | 'value'>, subtotal: number): number {
  if (subtotal <= 0) return 0;
  const value = typeof promo.value === 'bigint' ? Number(promo.value) : promo.value;
  if (value <= 0) return 0;
  let discount: number;
  if (promo.type === 'PERCENT') {
    const pct = Math.min(100, value);
    discount = Math.floor((subtotal * pct) / 100);
  } else {
    discount = Math.floor(value);
  }
  return Math.max(0, Math.min(discount, subtotal));
}

export interface AppliedPromotion {
  promotion: PromotionLike;
  discount: number;
}

/**
 * Pick the single best promotion for a subtotal. Non-stackable is the default
 * model: the eligible promotion yielding the largest discount wins; ties go to
 * the higher priority, then the smallest id for determinism.
 */
export function chooseBestPromotion(
  promos: PromotionLike[],
  subtotal: number,
  ctx: PromotionContext,
): AppliedPromotion | null {
  const eligible = promos.filter((p) => isPromotionEligible(p, ctx));
  if (eligible.length === 0) return null;

  let best: AppliedPromotion | null = null;
  for (const promotion of eligible) {
    const discount = discountFor(promotion, subtotal);
    if (discount <= 0) continue;
    if (
      !best ||
      discount > best.discount ||
      (discount === best.discount && promotion.priority > best.promotion.priority) ||
      (discount === best.discount &&
        promotion.priority === best.promotion.priority &&
        promotion.id < best.promotion.id)
    ) {
      best = { promotion, discount };
    }
  }
  return best;
}
