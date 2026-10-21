import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/maintenance.dto';

@ApiTags('maintenance')
@ApiBearerAuth()
@Controller()
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('clubs/:clubId/maintenance')
  list(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.maintenance.list(user, clubId);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Post('stations/:stationId/maintenance')
  create(
    @CurrentUser() user: AuthUser,
    @Param('stationId', ParseIntPipe) stationId: number,
    @Body() dto: CreateMaintenanceDto,
  ) {
    return this.maintenance.create(user, stationId, dto);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Delete('maintenance/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.maintenance.remove(user, id);
  }
}
