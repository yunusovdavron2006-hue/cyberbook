import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { BookingsService } from './bookings.service';
import {
  CancelBookingDto,
  CreateBookingDto,
  ListBookingsQueryDto,
  UpdateBookingStatusDto,
} from './dto/bookings.dto';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip ?? '';
}

@ApiTags('bookings')
@ApiBearerAuth()
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('bookings')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto, @Req() req: Request) {
    return this.bookings.create(user, dto, clientIp(req));
  }

  @Get('bookings/mine')
  mine(@CurrentUser() user: AuthUser, @Query() query: ListBookingsQueryDto) {
    return this.bookings.listMine(user, query);
  }

  @Get('bookings/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.bookings.getOne(user, id);
  }

  @Post('bookings/:id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelBookingDto,
    @Req() req: Request,
  ) {
    return this.bookings.cancel(user, id, dto, clientIp(req));
  }

  @Patch('bookings/:id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBookingStatusDto,
    @Req() req: Request,
  ) {
    return this.bookings.updateStatus(user, id, dto, clientIp(req));
  }

  @Post('bookings/:id/check-in')
  checkIn(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.bookings.checkIn(user, id);
  }

  @Get('clubs/:clubId/bookings')
  forClub(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookings.listForClub(user, clubId, query);
  }

  @Get('clubs/:clubId/dashboard')
  dashboard(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.bookings.clubDashboard(user, clubId);
  }
}
