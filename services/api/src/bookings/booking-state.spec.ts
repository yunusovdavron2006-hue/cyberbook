import { BookingStatus } from '@prisma/client';
import { canTransition, isBlocking, isTerminal } from './booking-state';

describe('booking state machine', () => {
  it('allows PENDING → CONFIRMED/CANCELLED/EXPIRED/NO_SHOW', () => {
    expect(canTransition(BookingStatus.PENDING, BookingStatus.CONFIRMED)).toBe(true);
    expect(canTransition(BookingStatus.PENDING, BookingStatus.CANCELLED)).toBe(true);
    expect(canTransition(BookingStatus.PENDING, BookingStatus.EXPIRED)).toBe(true);
    expect(canTransition(BookingStatus.PENDING, BookingStatus.NO_SHOW)).toBe(true);
  });

  it('allows CONFIRMED → COMPLETED/CANCELLED/NO_SHOW', () => {
    expect(canTransition(BookingStatus.CONFIRMED, BookingStatus.COMPLETED)).toBe(true);
    expect(canTransition(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)).toBe(true);
    expect(canTransition(BookingStatus.CONFIRMED, BookingStatus.NO_SHOW)).toBe(true);
  });

  it('rejects backwards/invalid transitions', () => {
    expect(canTransition(BookingStatus.PENDING, BookingStatus.COMPLETED)).toBe(false);
    expect(canTransition(BookingStatus.CONFIRMED, BookingStatus.PENDING)).toBe(false);
    expect(canTransition(BookingStatus.COMPLETED, BookingStatus.CANCELLED)).toBe(false);
    expect(canTransition(BookingStatus.CANCELLED, BookingStatus.CONFIRMED)).toBe(false);
    expect(canTransition(BookingStatus.EXPIRED, BookingStatus.CONFIRMED)).toBe(false);
  });

  it('marks terminal statuses', () => {
    expect(isTerminal(BookingStatus.CANCELLED)).toBe(true);
    expect(isTerminal(BookingStatus.COMPLETED)).toBe(true);
    expect(isTerminal(BookingStatus.EXPIRED)).toBe(true);
    expect(isTerminal(BookingStatus.NO_SHOW)).toBe(true);
    expect(isTerminal(BookingStatus.PENDING)).toBe(false);
    expect(isTerminal(BookingStatus.CONFIRMED)).toBe(false);
  });

  it('identifies blocking statuses', () => {
    expect(isBlocking(BookingStatus.PENDING)).toBe(true);
    expect(isBlocking(BookingStatus.CONFIRMED)).toBe(true);
    expect(isBlocking(BookingStatus.CANCELLED)).toBe(false);
    expect(isBlocking(BookingStatus.EXPIRED)).toBe(false);
  });
});
