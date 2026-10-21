import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CheckInController } from './checkin.controller';
import { CheckInService } from './checkin.service';

@Module({
  imports: [ClubsModule, BookingsModule],
  controllers: [CheckInController],
  providers: [CheckInService],
  exports: [CheckInService],
})
export class CheckInModule {}
