import { registerAs } from '@nestjs/config';

export interface AppConfig {
  port: number;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtlMinutes: number;
    refreshTtlDays: number;
  };
  bcryptSaltRounds: number;
  booking: {
    pendingTtlMinutes: number;
    cancellationDeadlineMinutes: number;
    minDurationMinutes: number;
    maxDurationMinutes: number;
    leadTimeMinutes: number;
    bufferMinutes: number;
    autoConfirm: boolean;
    maxHorizonDays: number;
    inviteTtlDays: number;
  };
  commission: {
    enabled: boolean;
    bps: number;
  };
  features: {
    loyaltyEarnPointsPerHour: number;
    referralRewardPoints: number;
    refereeBonusPoints: number;
    checkInTokenTtlHours: number;
    defaultCommissionBps: number;
    ai: {
      provider: string;
      model: string;
      apiKey: string | null;
      baseUrl: string | null;
    };
  };
  dev: {
    verificationFallback: boolean;
    seedDevelopmentData: boolean;
  };
}

export default registerAs('app', (): AppConfig => ({
  port: Number(process.env.API_PORT || 4000),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessTtlMinutes: Number(process.env.JWT_ACCESS_TTL_MINUTES || 15),
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS || 14),
  },
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 12),
  booking: {
    pendingTtlMinutes: Number(process.env.PENDING_TTL_MINUTES || 15),
    cancellationDeadlineMinutes: Number(process.env.CANCELLATION_DEADLINE_MINUTES || 30),
    minDurationMinutes: Number(process.env.BOOKING_MIN_DURATION_MINUTES || 30),
    maxDurationMinutes: Number(process.env.BOOKING_MAX_DURATION_MINUTES || 12 * 60),
    leadTimeMinutes: Number(process.env.BOOKING_LEAD_TIME_MINUTES || 0),
    bufferMinutes: Number(process.env.BOOKING_BUFFER_MINUTES || 0),
    autoConfirm: process.env.BOOKING_AUTO_CONFIRM !== 'false',
    maxHorizonDays: Number(process.env.BOOKING_MAX_HORIZON_DAYS || 30),
    inviteTtlDays: Number(process.env.GROUP_INVITE_TTL_DAYS || 14),
  },
  commission: {
    enabled: process.env.COMMISSION_ENABLED === 'true',
    bps: Number(process.env.COMMISSION_BPS || 0),
  },
  features: {
    loyaltyEarnPointsPerHour: Number(process.env.LOYALTY_EARN_POINTS_PER_HOUR || 10),
    referralRewardPoints: Number(process.env.LOYALTY_REFERRAL_REWARD_POINTS || 500),
    refereeBonusPoints: Number(process.env.LOYALTY_REFEREE_BONUS_POINTS || 100),
    checkInTokenTtlHours: Number(process.env.CHECKIN_TOKEN_TTL_HOURS || 24),
    defaultCommissionBps: Number(process.env.COMMISSION_DEFAULT_BPS || process.env.COMMISSION_BPS || 0),
    ai: {
      provider: process.env.AI_PROVIDER || 'heuristic',
      model: process.env.AI_MODEL || 'cyberbook-analytics-v1',
      apiKey: process.env.AI_API_KEY || null,
      baseUrl: process.env.AI_BASE_URL || null,
    },
  },
  dev: {
    verificationFallback: process.env.DEV_VERIFICATION_FALLBACK === 'true',
    seedDevelopmentData: process.env.SEED_DEVELOPMENT_DATA === 'true',
  },
}));
