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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { CommissionsService } from './commissions.service';
import {
  CreateSubscriptionPlanDto,
  ListCommissionsQueryDto,
  SubscribeDto,
  UpdateSubscriptionPlanDto,
} from './dto/subscriptions.dto';

@ApiTags('subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly commissions: CommissionsService,
  ) {}

  @Public()
  @Get('subscription-plans')
  listPlans() {
    return this.subscriptions.listPlans(true);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Get('admin/subscription-plans')
  listAllPlans() {
    return this.subscriptions.listPlans(false);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post('admin/subscription-plans')
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreateSubscriptionPlanDto) {
    return this.subscriptions.createPlan(user, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Put('admin/subscription-plans/:id')
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSubscriptionPlanDto,
  ) {
    return this.subscriptions.updatePlan(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('clubs/:clubId/subscription')
  current(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.subscriptions.listForClub(user, clubId);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post('clubs/:clubId/subscription')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: SubscribeDto,
  ) {
    return this.subscriptions.subscribe(user, clubId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Delete('clubs/:clubId/subscription/:id')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.subscriptions.cancel(user, clubId, id);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('clubs/:clubId/commissions')
  listCommissions(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query() query: ListCommissionsQueryDto,
  ) {
    return this.commissions.listForClub(user, clubId, query);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('clubs/:clubId/commissions/summary')
  commissionSummary(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.commissions.summary(user, clubId);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Patch('commissions/:id/charged')
  markCharged(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.commissions.markCharged(user, id);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Post('admin/commissions/:id/reverse')
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    return this.commissions.reverse(user, id, reason ?? 'unspecified');
  }
}
