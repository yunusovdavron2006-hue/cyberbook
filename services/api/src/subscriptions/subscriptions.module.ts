import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { CommissionsService } from './commissions.service';

@Module({
  imports: [ClubsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, CommissionsService],
  exports: [SubscriptionsService, CommissionsService],
})
export class SubscriptionsModule {}
