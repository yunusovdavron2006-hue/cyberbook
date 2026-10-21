import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, UserStatus, VerificationPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '../common/exceptions';
import { generateNumericCode } from '../common/utils/tokens.util';
import { normalizeUzPhone } from '../common/utils/text.util';
import { hashVerificationCode, PasswordService } from './password.service';
import { TokenService } from './token.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyCodeDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto, ua?: string, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists', 'EMAIL_TAKEN');
    }

    let phone: string | null = null;
    if (dto.phone) {
      phone = normalizeUzPhone(dto.phone);
      if (!phone) {
        throw new ConflictException('Phone number is not a valid Uzbek number', 'INVALID_PHONE');
      }
      const phoneTaken = await this.prisma.user.findUnique({ where: { phone } });
      if (phoneTaken) {
        throw new ConflictException('An account with this phone already exists', 'PHONE_TAKEN');
      }
    }

    // Never trust arbitrary client roles. Only USER and CLUB_OWNER are self-assignable.
    const role: Role = dto.role === 'CLUB_OWNER' ? Role.CLUB_OWNER : Role.USER;

    const user = await this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash: await this.passwords.hash(dto.password),
        role,
        profile: { create: { displayName: dto.fullName.trim() } },
      },
    });

    this.audit.log({
      actorUserId: user.id,
      action: 'user.register',
      entityType: 'User',
      entityId: user.id,
      ip,
    });

    const tokens = await this.tokens.issueTokenPair(
      { id: user.id, email: user.email, role: user.role },
      ua,
      ip,
    );
    return { ...tokens, user: this.toPublicUser(user) };
  }

  async login(dto: LoginDto, ua?: string, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    // Generic error message — never reveal whether the email exists.
    if (!user) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    const valid = await this.passwords.verify(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const tokens = await this.tokens.issueTokenPair(
      { id: user.id, email: user.email, role: user.role },
      ua,
      ip,
    );
    this.audit.log({
      actorUserId: user.id,
      action: 'user.login',
      entityType: 'User',
      entityId: user.id,
      ip,
    });
    return { ...tokens, user: this.toPublicUser(user) };
  }

  async refresh(refreshToken: string, ua?: string, ip?: string) {
    const tokens = await this.tokens.rotateRefresh(refreshToken, ua, ip);
    return tokens;
  }

  async logout(refreshToken: string, userId: number, ip?: string) {
    await this.tokens.revokeSession(refreshToken);
    this.audit.log({
      actorUserId: userId,
      action: 'user.logout',
      entityType: 'User',
      entityId: userId,
      ip,
    });
    return { loggedOut: true };
  }

  async logoutAll(userId: number) {
    await this.tokens.revokeAllForUser(userId);
    return { loggedOut: true };
  }

  async forgotPassword(dto: ForgotPasswordDto, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always return the same response to avoid account enumeration.
    if (!user) {
      return { sent: true };
    }
    const code = generateNumericCode(6);
    await this.prisma.verificationCode.create({
      data: {
        userId: user.id,
        purpose: VerificationPurpose.PASSWORD_RESET,
        codeHash: hashVerificationCode(code),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    this.audit.log({
      actorUserId: user.id,
      action: 'user.password_reset_requested',
      entityType: 'User',
      entityId: user.id,
      ip,
    });

    const devFallback = this.config.get<boolean>('app.dev.verificationFallback') === true;
    if (!devFallback) {
      // A real email/SMS provider adapter must be configured to deliver this code.
      return { sent: true };
    }
    this.logger.warn(
      `DEVELOPMENT ONLY: password reset code for ${email} is ${code}. ` +
        'Configure an email/SMS provider and disable DEV_VERIFICATION_FALLBACK in production.',
    );
    return { sent: true, developmentCode: code, devNotice: 'Development fallback — not a production delivery channel' };
  }

  async resetPassword(dto: ResetPasswordDto, ip?: string) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('Invalid code');

    const record = await this.prisma.verificationCode.findFirst({
      where: {
        userId: user.id,
        purpose: VerificationPurpose.PASSWORD_RESET,
        codeHash: hashVerificationCode(dto.code),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }
    await this.prisma.$transaction([
      this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(dto.newPassword) },
      }),
    ]);
    await this.tokens.revokeAllForUser(user.id);
    this.audit.log({
      actorUserId: user.id,
      action: 'user.password_reset',
      entityType: 'User',
      entityId: user.id,
      ip,
    });
    return { reset: true };
  }

  async verifyCode(userId: number, dto: VerifyCodeDto) {
    const purpose =
      dto.purpose === 'EMAIL' ? VerificationPurpose.EMAIL : VerificationPurpose.PHONE;
    const record = await this.prisma.verificationCode.findFirst({
      where: {
        userId,
        purpose,
        codeHash: hashVerificationCode(dto.code),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new UnauthorizedException('Invalid or expired code');

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { consumedAt: now },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data:
          purpose === VerificationPurpose.EMAIL
            ? { emailVerifiedAt: now }
            : { phoneVerifiedAt: now },
      }),
    ]);
    return { verified: true };
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  toPublicUser(user: {
    id: number;
    email: string;
    phone: string | null;
    role: Role;
    status: UserStatus;
    locale: string;
    emailVerifiedAt: Date | null;
    phoneVerifiedAt: Date | null;
    createdAt: Date;
    profile?: { displayName: string | null; avatarUrl: string | null } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      locale: user.locale,
      displayName: user.profile?.displayName ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
      emailVerified: Boolean(user.emailVerifiedAt),
      phoneVerified: Boolean(user.phoneVerifiedAt),
      createdAt: user.createdAt,
    };
  }
}
