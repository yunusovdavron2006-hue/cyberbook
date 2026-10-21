import { Global, Module } from '@nestjs/common';
import { ClubScheduleService } from './club-schedule.service';

@Global()
@Module({
  providers: [ClubScheduleService],
  exports: [ClubScheduleService],
})
export class CommonServicesModule {}
