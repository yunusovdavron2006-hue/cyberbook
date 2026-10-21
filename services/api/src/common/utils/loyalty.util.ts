/**
 * Pure loyalty/referral math. Integer points only.
 */

/** Points earned for a booking of `minutes`, at `pointsPerHour`. Floors to an integer. */
export function pointsForDuration(minutes: number, pointsPerHour: number): number {
  if (minutes <= 0 || pointsPerHour <= 0) return 0;
  return Math.floor((minutes * pointsPerHour) / 60);
}

/** Human-friendly referral code derived from random bytes. */
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function referralCodeFromBytes(bytes: Uint8Array, length = 8): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += REF_ALPHABET[bytes[i % bytes.length] % REF_ALPHABET.length];
  }
  return out;
}

/** Value of a single loyalty point in so'm when redeemed. */
export const POINTS_TO_UZS = 10;

export function pointsToUzs(points: number): number {
  return Math.max(0, Math.floor(points)) * POINTS_TO_UZS;
}

export function uzsToPoints(uzs: number): number {
  if (uzs <= 0) return 0;
  return Math.floor(uzs / POINTS_TO_UZS);
}

export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

/** Simple balance-based tiering used for display and perks. */
export function tierForBalance(balance: number): LoyaltyTier {
  if (balance >= 5000) return 'PLATINUM';
  if (balance >= 2000) return 'GOLD';
  if (balance >= 500) return 'SILVER';
  return 'BRONZE';
}

