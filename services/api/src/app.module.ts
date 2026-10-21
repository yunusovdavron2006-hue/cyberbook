import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { CommonServicesModule } from './common/services/common-services.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClubsModule } from './clubs/clubs.module';
import { StationsModule } from './stations/stations.module';
import { HoursModule } from './hours/hours.module';
import { PricingModule } from './pricing/pricing.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { FavoritesModule } from './favorites/favorites.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportModule } from './support/support.module';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { PromotionsModule } from './promotions/promotions.module';
import { CheckInModule } from './checkin/checkin.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { GroupBookingsModule } from './groups/group-bookings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { JwtAuthGuard, RolesGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      ignoreEnvFile: process.env.NODE_ENV === 'production' ? false : false,
    }),
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          level: process.env.NODE_ENV === 'test' ? 'silent' : process.env.LOG_LEVEL || 'info',
          autoLogging: process.env.NODE_ENV !== 'test',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              '*.password',
              '*.token',
              '*.code',
              '*.passwordHash',
              '*.codeHash',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS || 60) * 1000,
        limit: Number(process.env.RATE_LIMIT_MAX_GENERAL || 300),
      },
    ]),
    PrismaModule,
    CommonServicesModule,
    AuthModule,
    UsersModule,
    ClubsModule,
    StationsModule,
    HoursModule,
    PricingModule,
    MaintenanceModule,
    AvailabilityModule,
    BookingsModule,
    PaymentsModule,
    ReviewsModule,
    FavoritesModule,
    NotificationsModule,
    SupportModule,
    AdminModule,
    AuditModule,
    HealthModule,
    PromotionsModule,
    CheckInModule,
    LoyaltyModule,
    SubscriptionsModule,
    GroupBookingsModule,
    AnalyticsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer) {
    // Security headers are applied in main.ts via a plain middleware.
  }
}
