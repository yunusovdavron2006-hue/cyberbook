/**
 * Money utilities. Amounts are integer so'm (UZS) stored as bigint.
 * Never use floating-point arithmetic for financial calculations.
 */

export function billableMinutes(startsAt: Date, endsAt: Date): number {
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
}

/** total = amount * minutes / 60, rounded half-up to whole so'm. */
export function multiplyHourlyRate(perHour: bigint, minutes: number): bigint {
  if (minutes <= 0) return 0n;
  const numerator = perHour * BigInt(minutes);
  return (numerator + 30n) / 60n;
}

export function formatUzs(amount: bigint | number): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(Math.round(amount));
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${negative ? '-' : ''}${digits} so'm`;
}

export function parseUzsInput(value: string | number): bigint {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('Amount must be a whole number of so\'m');
    return BigInt(value);
  }
  const cleaned = value.replace(/[\s'’,_]/g, '');
  if (!/^-?\d+$/.test(cleaned)) throw new Error('Amount must be an integer number of so\'m');
  return BigInt(cleaned);
}

/** Commission in integer so'm, basis points, rounded half-up. Zero when disabled. */
export function commissionAmount(amount: bigint, bps: number, enabled: boolean): bigint {
  if (!enabled || bps <= 0) return 0n;
  const numerator = amount * BigInt(Math.round(bps));
  return (numerator + 5000n) / 10000n;
}
