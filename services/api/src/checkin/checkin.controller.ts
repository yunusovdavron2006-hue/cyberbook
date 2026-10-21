import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CheckInService } from './checkin.service';
import { CheckInTokenDto } from './dto/checkin.dto';

@ApiTags('check-in')
@ApiBearerAuth()
@Controller()
export class CheckInController {
  constructor(private readonly checkIn: CheckInService) {}

  @Post('bookings/:id/check-in-token')
  issue(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.checkIn.issue(user, id);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Post('check-in/resolve')
  resolve(@CurrentUser() user: AuthUser, @Body() dto: CheckInTokenDto) {
    return this.checkIn.resolve(user, dto.token);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Post('check-in/consume')
  consume(@CurrentUser() user: AuthUser, @Body() dto: CheckInTokenDto) {
    return this.checkIn.consume(user, dto.token);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Post('check-in/by-reference/:reference')
  consumeByReference(@CurrentUser() user: AuthUser, @Param('reference') reference: string) {
    return this.checkIn.consumeByReference(user, reference);
  }
}
