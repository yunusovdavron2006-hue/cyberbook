import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller()
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get('favorites/mine')
  list(@CurrentUser() user: AuthUser) {
    return this.favorites.list(user.id);
  }

  @Post('clubs/:clubId/favorite')
  toggle(@CurrentUser() user: AuthUser, @Param('clubId', ParseIntPipe) clubId: number) {
    return this.favorites.toggle(user.id, clubId);
  }
}
