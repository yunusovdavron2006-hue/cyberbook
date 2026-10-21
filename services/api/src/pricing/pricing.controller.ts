import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from '../stations/dto/stations.dto';
import { ApiException } from '../common/exceptions';

class ToggleRuleDto {
  @IsBoolean()
  active!: boolean;
}

@ApiTags('pricing')
@ApiBearerAuth()
@Controller('clubs/:clubId/pricing-rules')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get()
  list(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.pricing.listRules(user, clubId);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreatePricingRuleDto,
  ) {
    return this.pricing.createRule(user, clubId, dto);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Patch(':ruleId')
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('ruleId', ParseIntPipe) ruleId: number,
    @Body() dto: ToggleRuleDto,
  ) {
    return this.pricing.setRuleActive(user, clubId, ruleId, dto.active);
  }

  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Delete(':ruleId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('ruleId', ParseIntPipe) ruleId: number,
  ) {
    return this.pricing.removeRule(user, clubId, ruleId);
  }
}

@ApiTags('pricing')
@Controller('clubs/:clubId')
export class PriceQuoteController {
  constructor(private readonly pricing: PricingService) {}

  /** Public, server-authoritative price estimate for a candidate booking. */
  @Public()
  @Get('price-quote')
  quote(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query('stationId') stationId: string,
    @Query('startsAt') startsAt: string,
    @Query('endsAt') endsAt: string,
  ) {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ApiException('startsAt and endsAt must be ISO-8601 timestamps');
    }
    return this.pricing.quote(clubId, Number(stationId), start, end);
  }
}
