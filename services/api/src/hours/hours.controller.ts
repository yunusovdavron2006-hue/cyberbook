import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { HoursService } from './hours.service';
import { CreateClosureDto, SetOperatingHoursDto } from './dto/hours.dto';

@ApiTags('hours')
@ApiBearerAuth()
@Controller('clubs/:clubId')
export class HoursController {
  constructor(private readonly hours: HoursService) {}

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('hours')
  get(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.hours.get(user, clubId);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Put('hours')
  set(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: SetOperatingHoursDto,
  ) {
    return this.hours.set(user, clubId, dto);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('closures')
  closures(@Param('clubId', ParseIntPipe) clubId: number) {
    return this.hours.listClosures(clubId);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post('closures')
  addClosure(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreateClosureDto,
  ) {
    return this.hours.addClosure(user, clubId, dto);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Delete('closures/:closureId')
  removeClosure(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('closureId', ParseIntPipe) closureId: number,
  ) {
    return this.hours.removeClosure(user, clubId, closureId);
  }
}
