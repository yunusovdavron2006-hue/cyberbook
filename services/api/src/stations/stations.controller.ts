import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { StationsService } from './stations.service';
import {
  BulkCreateStationsDto,
  CreateStationDto,
  StationStatusDto,
  UpdateStationDto,
  UpdateStationLayoutDto,
} from './dto/stations.dto';

@ApiTags('stations')
@Controller()
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @Public()
  @Get('station-categories')
  categories() {
    return this.stations.listCategories();
  }

  @Public()
  @Get('clubs/:clubId/stations')
  listPublic(@Param('clubId', ParseIntPipe) clubId: number) {
    return this.stations.listPublic(clubId);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('clubs/:clubId/stations/manage')
  listManage(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.stations.listManage(user, clubId);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post('clubs/:clubId/stations')
  create(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreateStationDto,
  ) {
    return this.stations.create(user, clubId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post('clubs/:clubId/stations/bulk')
  bulk(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: BulkCreateStationsDto,
  ) {
    return this.stations.bulkCreate(user, clubId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Put('clubs/:clubId/stations/layout')
  updateLayout(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: UpdateStationLayoutDto,
  ) {
    return this.stations.updateLayout(user, clubId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Put('stations/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStationDto,
  ) {
    return this.stations.update(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Patch('stations/:id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StationStatusDto,
  ) {
    return this.stations.setStatus(user, id, dto.status);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Delete('stations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.stations.remove(user, id);
  }
}
