import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto, GenerateInsightDto, ListInsightsQueryDto } from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('clubs/:clubId/analytics/overview')
  overview(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analytics.overview(user, clubId, query.periodDays ?? 30);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('clubs/:clubId/analytics/insights')
  listInsights(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query() query: ListInsightsQueryDto,
  ) {
    return this.analytics.listInsights(user, clubId, query.limit ?? 20);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post('clubs/:clubId/analytics/insights')
  generate(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: GenerateInsightDto,
  ) {
    return this.analytics.generateInsight(user, clubId, dto.periodDays ?? 30, dto.kind ?? 'club_summary');
  }

  @Roles(Role.ADMIN)
  @Get('admin/analytics/platform')
  platform(@CurrentUser() user: AuthUser) {
    return this.analytics.platformOverview(user);
  }
}
