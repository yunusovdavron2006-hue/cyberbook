import {
  billableMinutes,
  commissionAmount,
  formatUzs,
  multiplyHourlyRate,
  parseUzsInput,
} from './money.util';

describe('money.util', () => {
  describe('billableMinutes', () => {
    it('computes whole minutes between two instants', () => {
      const start = new Date('2026-01-01T10:00:00.000Z');
      const end = new Date('2026-01-01T12:30:00.000Z');
      expect(billableMinutes(start, end)).toBe(150);
    });
  });

  describe('multiplyHourlyRate', () => {
    it('returns 0 for non-positive minutes', () => {
      expect(multiplyHourlyRate(25000n, 0)).toBe(0n);
      expect(multiplyHourlyRate(25000n, -30)).toBe(0n);
    });

    it('multiplies cleanly for whole hours', () => {
      expect(multiplyHourlyRate(25000n, 120)).toBe(50000n);
    });

    it('rounds half-up to whole so\'m for partial hours', () => {
      // 25000 * 30 / 60 = 12500 exactly
      expect(multiplyHourlyRate(25000n, 30)).toBe(12500n);
      // 100 / hour for 1 minute = 1.666.. -> 2 (half-up rounding of +30)
      expect(multiplyHourlyRate(100n, 1)).toBe(2n);
      // 99 for 1 minute = 1.65 -> 2
      expect(multiplyHourlyRate(99n, 1)).toBe(2n);
      // 89 for 1 minute = 1.483 -> 1
      expect(multiplyHourlyRate(89n, 1)).toBe(1n);
    });
  });

  describe('formatUzs', () => {
    it('groups thousands with spaces and appends so\'m', () => {
      expect(formatUzs(25000n)).toBe("25 000 so'm");
      expect(formatUzs(1234567n)).toBe("1 234 567 so'm");
    });

    it('handles negatives', () => {
      expect(formatUzs(-5000n)).toBe("-5 000 so'm");
    });
  });

  describe('parseUzsInput', () => {
    it('parses integers and strips separators', () => {
      expect(parseUzsInput("25 000 so'm".replace(" so'm", ''))).toBe(25000n);
      expect(parseUzsInput('12000')).toBe(12000n);
      expect(parseUzsInput('1_234')).toBe(1234n);
    });

    it('rejects non-integer input', () => {
      expect(() => parseUzsInput('12.5')).toThrow();
      expect(() => parseUzsInput('abc')).toThrow();
      expect(() => parseUzsInput(12.5)).toThrow();
    });
  });

  describe('commissionAmount', () => {
    it('is zero when disabled or bps <= 0', () => {
      expect(commissionAmount(100000n, 500, false)).toBe(0n);
      expect(commissionAmount(100000n, 0, true)).toBe(0n);
    });

    it('computes basis points, rounded half-up', () => {
      // 100000 * 500 bps = 5% = 5000
      expect(commissionAmount(100000n, 500, true)).toBe(5000n);
      // 100000 * 250 bps = 2.5% = 2500
      expect(commissionAmount(100000n, 250, true)).toBe(2500n);
    });
  });
});
