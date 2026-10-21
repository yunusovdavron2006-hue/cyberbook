import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ClubsService } from './clubs.service';
import {
  CreateBranchDto,
  CreateClubDto,
  InviteStaffDto,
  SearchClubsDto,
  UpdateClubDto,
} from './dto/clubs.dto';

@ApiTags('clubs')
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubs: ClubsService) {}

  // --------------------------------------------------------------- public

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get()
  search(@Query() query: SearchClubsDto) {
    return this.clubs.search(query);
  }

  @Public()
  @Get(':idOrSlug')
  getPublic(
    @Param('idOrSlug') idOrSlug: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.clubs.getPublic(
      idOrSlug,
      lat !== undefined ? Number(lat) : undefined,
      lng !== undefined ? Number(lng) : undefined,
    );
  }

  // ---------------------------------------------------------------- owner

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Get('owner/mine')
  myClubs(@CurrentUser() user: AuthUser) {
    return this.clubs.myClubs(user);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClubDto) {
    return this.clubs.create(user, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get(':id/manage')
  ownerDetail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.clubs.ownerClubDetail(user, id);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClubDto,
  ) {
    return this.clubs.update(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.clubs.remove(user, id);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.clubs.submitForApproval(user, id);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post(':id/branches')
  addBranch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBranchDto,
  ) {
    return this.clubs.addBranch(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post(':id/staff')
  inviteStaff(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InviteStaffDto,
  ) {
    return this.clubs.inviteStaff(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Delete(':id/staff/:membershipId')
  removeStaff(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('membershipId', ParseIntPipe) membershipId: number,
  ) {
    return this.clubs.removeStaff(user, id, membershipId);
  }
}
