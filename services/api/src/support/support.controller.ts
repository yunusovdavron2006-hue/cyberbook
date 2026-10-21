import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role, TicketStatus } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SupportService } from './support.service';
import {
  AddMessageDto,
  AssignTicketDto,
  CreateTicketDto,
  ListTicketsQueryDto,
  UpdateTicketStatusDto,
} from './dto/support.dto';

@ApiTags('support')
@ApiBearerAuth()
@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('support/tickets')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.create(user, dto);
  }

  @Get('support/tickets/mine')
  listMine(@CurrentUser() user: AuthUser) {
    return this.support.listMine(user.id);
  }

  @Get('support/tickets/:id')
  getOne(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.support.getOne(user, id);
  }

  @Post('support/tickets/:id/messages')
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMessageDto,
  ) {
    return this.support.addMessage(user, id, dto);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('clubs/:clubId/support-tickets')
  listForClub(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query() query: ListTicketsQueryDto,
  ) {
    return this.support.listForClub(user, clubId, query);
  }

  @Roles(Role.ADMIN)
  @Get('admin/support/tickets')
  listAll(@CurrentUser() user: AuthUser, @Query() query: ListTicketsQueryDto) {
    return this.support.listAll(user, query);
  }

  @Roles(Role.ADMIN)
  @Patch('admin/support/tickets/:id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.support.updateStatus(user, id, dto.status as TicketStatus, dto.note);
  }

  @Roles(Role.ADMIN)
  @Patch('admin/support/tickets/:id/assign')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTicketDto,
  ) {
    return this.support.assign(user, id, dto);
  }
}
