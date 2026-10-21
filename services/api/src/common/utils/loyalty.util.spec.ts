import {
  POINTS_TO_UZS,
  pointsForDuration,
  pointsToUzs,
  referralCodeFromBytes,
  tierForBalance,
  uzsToPoints,
} from './loyalty.util';

describe('loyalty.util', () => {
  describe('pointsForDuration', () => {
    it('earns floor(minutes * pointsPerHour / 60)', () => {
      expect(pointsForDuration(60, 10)).toBe(10);
      expect(pointsForDuration(120, 10)).toBe(20);
      expect(pointsForDuration(90, 10)).toBe(15);
    });

    it('floors partial points', () => {
      // 30 min at 10/h = 5 exactly
      expect(pointsForDuration(30, 10)).toBe(5);
      // 45 min at 10/h = 7.5 -> 7
      expect(pointsForDuration(45, 10)).toBe(7);
      // 20 min at 10/h = 3.33 -> 3
      expect(pointsForDuration(20, 10)).toBe(3);
    });

    it('returns 0 for non-positive inputs', () => {
      expect(pointsForDuration(0, 10)).toBe(0);
      expect(pointsForDuration(-30, 10)).toBe(0);
      expect(pointsForDuration(60, 0)).toBe(0);
      expect(pointsForDuration(60, -1)).toBe(0);
    });
  });

  describe('points <-> UZS conversion', () => {
    it('uses the documented 1 point = 10 so\'m rate', () => {
      expect(POINTS_TO_UZS).toBe(10);
      expect(pointsToUzs(100)).toBe(1000);
      expect(uzsToPoints(1000)).toBe(100);
    });

    it('never returns negative values', () => {
      expect(pointsToUzs(-5)).toBe(0);
      expect(uzsToPoints(-100)).toBe(0);
      expect(uzsToPoints(0)).toBe(0);
    });

    it('floors on both directions', () => {
      expect(pointsToUzs(3.9)).toBe(30);
      expect(uzsToPoints(15)).toBe(1);
    });
  });

  describe('referralCodeFromBytes', () => {
    it('produces a code of the requested length', () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(referralCodeFromBytes(bytes, 8)).toHaveLength(8);
      expect(referralCodeFromBytes(bytes, 6)).toHaveLength(6);
    });

    it('uses only the unambiguous alphabet (no 0/O/1/I/L)', () => {
      const bytes = new Uint8Array(Array.from({ length: 64 }, (_, i) => i));
      const code = referralCodeFromBytes(bytes, 64);
      expect(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]+$/.test(code)).toBe(true);
    });

    it('is deterministic for the same input', () => {
      const bytes = new Uint8Array([9, 9, 9, 9]);
      expect(referralCodeFromBytes(bytes, 8)).toBe(referralCodeFromBytes(bytes, 8));
    });
  });

  describe('tierForBalance', () => {
    it('maps balances to tiers at the documented thresholds', () => {
      expect(tierForBalance(0)).toBe('BRONZE');
      expect(tierForBalance(499)).toBe('BRONZE');
      expect(tierForBalance(500)).toBe('SILVER');
      expect(tierForBalance(1999)).toBe('SILVER');
      expect(tierForBalance(2000)).toBe('GOLD');
      expect(tierForBalance(4999)).toBe('GOLD');
      expect(tierForBalance(5000)).toBe('PLATINUM');
    });
  });
});
