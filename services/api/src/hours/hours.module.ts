import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { HoursController } from './hours.controller';
import { HoursService } from './hours.service';

@Module({
  imports: [ClubsModule],
  controllers: [HoursController],
  providers: [HoursService],
  exports: [HoursService],
})
export class HoursModule {}
