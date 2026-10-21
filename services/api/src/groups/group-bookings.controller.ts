import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { GroupBookingsService } from './group-bookings.service';
import { CreateGroupBookingDto, CreateGroupInvitesDto, RespondToInviteDto } from './dto/groups.dto';

@ApiTags('group-bookings')
@ApiBearerAuth()
@Controller('group-bookings')
export class GroupBookingsController {
  constructor(private readonly groups: GroupBookingsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupBookingDto) {
    return this.groups.create(user, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.groups.listMine(user);
  }

  @Get('invites/mine')
  listMyInvites(@CurrentUser() user: AuthUser) {
    return this.groups.listMyInvites(user);
  }

  @Post('invites/respond')
  respond(@CurrentUser() user: AuthUser, @Body() dto: RespondToInviteDto) {
    return this.groups.respondToInvite(user, dto.token, dto.action);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.groups.getOne(user, id);
  }

  @Post(':id/invites')
  createInvites(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateGroupInvitesDto,
  ) {
    return this.groups.createInvites(user, id, dto.invitees);
  }

  @Get(':id/invites')
  listInvites(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.groups.listInvites(user, id);
  }

  @Post(':id/invites/:participantId/revoke')
  revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('participantId', ParseIntPipe) participantId: number,
  ) {
    return this.groups.revokeInvite(user, id, participantId);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ) {
    return this.groups.cancel(user, id, reason);
  }
}
