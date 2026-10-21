import { BookingStatus } from '@prisma/client';

/**
 * Booking state machine. Terminal states cannot transition.
 *
 *   PENDING   → CONFIRMED | CANCELLED | EXPIRED | NO_SHOW
 *   CONFIRMED → COMPLETED | CANCELLED | NO_SHOW
 *   CANCELLED | COMPLETED | EXPIRED | NO_SHOW → (terminal)
 */
export const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [
    BookingStatus.CONFIRMED,
    BookingStatus.CANCELLED,
    BookingStatus.EXPIRED,
    BookingStatus.NO_SHOW,
  ],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.COMPLETED]: [],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.NO_SHOW]: [],
};

/** Statuses that block a station's time slot from being rebooked. */
export const BLOCKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export function isBlocking(status: BookingStatus): boolean {
  return BLOCKING_STATUSES.includes(status);
}
