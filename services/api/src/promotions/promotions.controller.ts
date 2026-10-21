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
import { PromotionsService } from './promotions.service';
import {
  CreatePromotionDto,
  PreviewPromotionDto,
  UpdatePromotionDto,
} from './dto/promotions.dto';

@ApiTags('promotions')
@Controller('clubs/:clubId/promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Public()
  @Get()
  publicOffers(@Param('clubId', ParseIntPipe) clubId: number) {
    return this.promotions.listPublicOffers(clubId);
  }

  @Public()
  @Post('preview')
  preview(@Param('clubId', ParseIntPipe) clubId: number, @Body() dto: PreviewPromotionDto) {
    return this.promotions.preview({ ...dto, clubId });
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN, Role.STAFF)
  @Get('manage')
  list(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.promotions.listForClub(user, clubId);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreatePromotionDto,
  ) {
    return this.promotions.create(user, clubId, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotions.update(user, clubId, id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Patch(':id/active')
  setActive(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('active') active: boolean,
  ) {
    return this.promotions.setActive(user, clubId, id, active === true);
  }

  @ApiBearerAuth()
  @Roles(Role.CLUB_OWNER, Role.ADMIN)
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.promotions.remove(user, clubId, id);
  }
}
