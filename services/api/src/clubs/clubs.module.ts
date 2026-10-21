import { Module } from '@nestjs/common';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';
import { ClubAccessService } from './club-access.service';

@Module({
  controllers: [ClubsController],
  providers: [ClubsService, ClubAccessService],
  exports: [ClubsService, ClubAccessService],
})
export class ClubsModule {}
