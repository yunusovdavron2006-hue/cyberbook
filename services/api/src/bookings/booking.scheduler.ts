import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';

/**
 * Background worker for time-based booking maintenance:
 *  - releases expired PENDING reservations so they stop blocking availability
 *  - sends upcoming-reservation reminders
 *
 * These run in-process for the MVP. In production this should be moved to a
 * dedicated worker/queue (Redis/BullMQ) when scale requires it.
 */
@Injectable()
export class BookingScheduler {
  private readonly logger = new Logger(BookingScheduler.name);

  constructor(private readonly bookings: BookingsService) {}

  @Interval(60_000)
  async handleExpiry() {
    try {
      await this.bookings.expirePendingBookings();
    } catch (error) {
      this.logger.error(`expiry sweep failed: ${(error as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleReminders() {
    try {
      await this.bookings.sendUpcomingReminders();
    } catch (error) {
      this.logger.error(`reminder sweep failed: ${(error as Error).message}`);
    }
  }
}
