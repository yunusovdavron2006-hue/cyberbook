import { Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';

@Module({
  controllers: [LoyaltyController],
  providers: [LoyaltyService, ReferralService],
  exports: [LoyaltyService, ReferralService],
})
export class LoyaltyModule {}
