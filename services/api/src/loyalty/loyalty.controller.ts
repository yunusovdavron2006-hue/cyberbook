import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { LoyaltyService } from './loyalty.service';
import { ReferralService } from './referral.service';
import {
  AdjustPointsDto,
  ApplyReferralDto,
  ListLedgerQueryDto,
  RedeemPointsDto,
} from './dto/loyalty.dto';

@ApiTags('loyalty')
@ApiBearerAuth()
@Controller('loyalty')
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralService,
  ) {}

  @Get('me')
  account(@CurrentUser() user: AuthUser) {
    return this.loyalty.account(user.id);
  }

  @Get('me/ledger')
  ledger(@CurrentUser() user: AuthUser, @Query() query: ListLedgerQueryDto) {
    return this.loyalty.ledger(user.id, query);
  }

  @Post('redeem')
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemPointsDto) {
    return this.loyalty.redeem(user, dto);
  }

  @Get('referral')
  myReferral(@CurrentUser() user: AuthUser) {
    return this.referrals.myCode(user);
  }

  @Get('referral/list')
  listReferrals(@CurrentUser() user: AuthUser) {
    return this.referrals.listMine(user.id);
  }

  @Post('referral/apply')
  applyReferral(@CurrentUser() user: AuthUser, @Body() dto: ApplyReferralDto) {
    return this.referrals.apply(user, dto);
  }

  @Roles(Role.ADMIN)
  @Post('admin/adjust')
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustPointsDto) {
    return this.loyalty.adjust(user, dto);
  }
}
