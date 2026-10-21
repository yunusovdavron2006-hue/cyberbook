import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SubscriptionBillingPeriod } from '@prisma/client';

export class CreateSubscriptionPlanDto {
  @ApiProperty({ example: 'pro' })
  @IsString()
  @Matches(/^[a-z0-9_-]+$/, { message: 'key must be lowercase letters, digits, _ or -' })
  @MaxLength(40)
  key!: string;

  @ApiProperty({ example: 'Pro' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 299000, description: 'integer UZS per billing period' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceAmount!: number;

  @ApiPropertyOptional({ enum: SubscriptionBillingPeriod, default: 'MONTHLY' })
  @IsOptional()
  @IsEnum(SubscriptionBillingPeriod)
  billingPeriod?: SubscriptionBillingPeriod;

  @ApiProperty({ example: 500, description: 'platform commission in basis points (100 bps = 1%)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  commissionBps!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStations?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSubscriptionPlanDto extends CreateSubscriptionPlanDto {}

export class SubscribeDto {
  @ApiPropertyOptional({ example: 'pro' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  planKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  planId?: number;

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  trialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}

export class ListCommissionsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size?: number;
}
