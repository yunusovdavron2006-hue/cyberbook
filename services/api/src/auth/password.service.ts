import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class PasswordService {
  constructor(private readonly config: ConfigService) {}

  private get rounds(): number {
    return this.config.get<number>('app.bcryptSaltRounds') ?? 12;
  }

  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.rounds);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
}

/** Hash short-lived verification codes before storing them. */
export function hashVerificationCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}
