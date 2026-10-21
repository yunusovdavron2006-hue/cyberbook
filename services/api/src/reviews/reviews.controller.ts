import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReviewStatus } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, ListReviewsQueryDto, SetReviewStatusDto } from './dto/reviews.dto';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('clubs/:clubId/reviews')
  listPublic(@Param('clubId', ParseIntPipe) clubId: number, @Query() query: ListReviewsQueryDto) {
    return this.reviews.listPublic(clubId, query);
  }

  @ApiBearerAuth()
  @Post('clubs/:clubId/reviews')
  create(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviews.create(user, clubId, dto);
  }

  @ApiBearerAuth()
  @Get('clubs/:clubId/reviews/manage')
  listForClub(
    @CurrentUser() user: AuthUser,
    @Param('clubId', ParseIntPipe) clubId: number,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.reviews.listForClub(user, clubId, query);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Patch('admin/reviews/:id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetReviewStatusDto,
  ) {
    return this.reviews.setStatus(user, id, dto.status as ReviewStatus);
  }
}
