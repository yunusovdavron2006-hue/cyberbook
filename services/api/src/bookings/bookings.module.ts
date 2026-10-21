import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { PricingModule } from '../pricing/pricing.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingScheduler } from './booking.scheduler';

@Module({
  imports: [ClubsModule, PricingModule, PromotionsModule, LoyaltyModule, SubscriptionsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingScheduler],
  exports: [BookingsService],
})
export class BookingsModule {}
