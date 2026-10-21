import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('payments/providers')
  providers() {
    return this.payments.listProviders();
  }

  @ApiBearerAuth()
  @Post('bookings/:id/pay-at-club')
  payAtClub(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.payments.payAtClub(user, id);
  }

  @ApiBearerAuth()
  @Get('bookings/:id/payment')
  forBooking(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.payments.forBooking(user, id);
  }

  @ApiBearerAuth()
  @Post('bookings/:id/payment/mark-paid')
  markPaid(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.payments.markPaid(user, id);
  }
}
