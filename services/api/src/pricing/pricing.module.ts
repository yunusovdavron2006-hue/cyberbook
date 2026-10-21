import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { PricingController, PriceQuoteController } from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [ClubsModule],
  controllers: [PricingController, PriceQuoteController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
