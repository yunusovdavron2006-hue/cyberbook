import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { generateToken } from '../common/utils/tokens.util';
import { UnauthorizedException } from '../common/exceptions';

export interface AccessTokenPayload {
  sub: number;
  email: string;
  role: string;
  jti: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get accessSecret(): string {
    return this.config.get<string>('app.jwt.accessSecret')!;
  }

  private get accessTtlMinutes(): number {
    return this.config.get<number>('app.jwt.accessTtlMinutes')!;
  }

  private get refreshTtlDays(): number {
    return this.config.get<number>('app.jwt.refreshTtlDays')!;
  }

  async signAccessToken(user: { id: number; email: string; role: string }): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
    };
    return this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: `${this.accessTtlMinutes}m`,
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, { secret: this.accessSecret });
    } catch {
      return null;
    }
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(userId: number, userAgent?: string, ip?: string): Promise<string> {
    const raw = generateToken(48);
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: this.hash(raw),
        expiresAt,
        userAgent: userAgent?.slice(0, 300),
        ip: ip?.slice(0, 60),
      },
    });
    return raw;
  }

  async issueTokenPair(
    user: { id: number; email: string; role: string },
    userAgent?: string,
    ip?: string,
  ) {
    const accessToken = await this.signAccessToken(user);
    const refreshToken = await this.createSession(user.id, userAgent, ip);
    return { accessToken, refreshToken };
  }

  /** Rotate a refresh token: verify, revoke the old session, issue a new pair. */
  async rotateRefresh(rawToken: string, userAgent?: string, ip?: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hash(rawToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokenPair(
      { id: session.user.id, email: session.user.email, role: session.user.role },
      userAgent,
      ip,
    );
  }

  async revokeSession(rawToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: this.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
