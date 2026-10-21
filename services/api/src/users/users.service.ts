import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, UnauthorizedException } from '../common/exceptions';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto, ChangePasswordDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async getProfile(userId: number) {
    return this.auth.me(userId);
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.locale ? { locale: dto.locale } : {}),
        profile: {
          upsert: {
            create: { displayName: dto.displayName ?? null, avatarUrl: dto.avatarUrl ?? null },
            update: {
              ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
              ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
            },
          },
        },
      },
    });
    return this.auth.me(userId);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await this.passwords.verify(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(dto.newPassword) },
    });
    // Changing a password invalidates all other sessions.
    await this.tokens.revokeAllForUser(userId);
    this.audit.log({ actorUserId: userId, action: 'user.password_changed', entityType: 'User', entityId: userId });
    return { changed: true };
  }

  /** Soft deactivation — records are retained for audit/history. */
  async deactivate(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'DEACTIVATED' },
    });
    await this.tokens.revokeAllForUser(userId);
    this.audit.log({ actorUserId: userId, action: 'user.deactivated', entityType: 'User', entityId: userId });
    return { deactivated: true };
  }
}
