import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { ApiException } from '../common/exceptions';
import { AvailabilityService } from './availability.service';

@ApiTags('availability')
@Controller()
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('clubs/:clubId/availability')
  day(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query('date') date?: string,
  ) {
    const iso = date ?? undefined;
    if (iso && !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new ApiException('date must be yyyy-mm-dd');
    }
    return this.availability.getDayAvailability(clubId, iso);
  }

  /**
   * Live "is each station free right now" snapshot. Read-only and cheap, so the
   * web client can poll it on a short interval to give real-time availability
   * without any WebSocket/SSE infrastructure. Throttled a little higher to allow
   * many venues to be watched concurrently.
   */
  @Public()
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Get('clubs/:clubId/availability/now')
  now(@Param('clubId', ParseIntPipe) clubId: number) {
    return this.availability.getLiveAvailability(clubId);
  }

  @Public()
  @Get('stations/:stationId/busy')
  busy(
    @Param('stationId', ParseIntPipe) stationId: number,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new ApiException('from and to must be ISO-8601 timestamps');
    }
    return this.availability.getStationBusy(stationId, fromDate, toDate);
  }
}
