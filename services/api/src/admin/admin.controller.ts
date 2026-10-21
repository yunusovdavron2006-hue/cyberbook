import {
  Body,
  Controller,
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
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  ListClubsQueryDto,
  ListUsersQueryDto,
  ReviewClubDto,
  UpdateSettingDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/admin.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id', ParseIntPipe) id: number) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id/role')
  setRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.admin.setUserRole(user, id, dto.role);
  }

  @Patch('users/:id/status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.admin.setUserStatus(user, id, dto.status);
  }

  @Get('clubs')
  listClubs(@Query() query: ListClubsQueryDto) {
    return this.admin.listClubs(query);
  }

  @Get('clubs/:id')
  getClub(@Param('id', ParseIntPipe) id: number) {
    return this.admin.getClub(id);
  }

  @Post('clubs/:id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.approveClub(user, id);
  }

  @Post('clubs/:id/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewClubDto,
  ) {
    return this.admin.rejectClub(user, id, dto.reason);
  }

  @Post('clubs/:id/suspend')
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewClubDto,
  ) {
    return this.admin.suspendClub(user, id, dto.reason);
  }

  @Post('clubs/:id/reactivate')
  reactivate(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.reactivateClub(user, id);
  }

  @Get('settings')
  getSettings() {
    return this.admin.getSettings();
  }

  @Put('settings/:key')
  setSetting(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
  ) {
    return this.admin.setSetting(user, key, dto.value);
  }
}
