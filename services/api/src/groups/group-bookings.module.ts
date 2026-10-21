import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { PricingModule } from '../pricing/pricing.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { GroupBookingsController } from './group-bookings.controller';
import { GroupBookingsService } from './group-bookings.service';

@Module({
  imports: [ClubsModule, PricingModule, PromotionsModule],
  controllers: [GroupBookingsController],
  providers: [GroupBookingsService],
  exports: [GroupBookingsService],
})
export class GroupBookingsModule {}
