import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PromotionType } from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreatePromotionDto {
  @ApiPropertyOptional({ example: 'WEEKEND20', description: 'Optional public promo code' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code may contain letters, digits, underscore and dash' })
  code?: string;

  @ApiProperty({ example: 'Weekend discount' })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: PromotionType })
  @IsEnum(PromotionType)
  type!: PromotionType;

  @ApiProperty({
    example: 20,
    description: 'PERCENT → whole percent (1..100); FLAT → integer UZS off',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  value!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stationId?: number;

  @ApiPropertyOptional({ description: 'Station category id (mutually exclusive with stationId)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @ApiPropertyOptional({ example: [5, 6], description: '0=Mon … 6=Sun; empty = every day' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  dayOfWeeks?: number[];

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(HHMM)
  startsAtTime?: string;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @Matches(HHMM)
  endsAtTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  minDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsesTotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsesPerUser?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePromotionDto extends CreatePromotionDto {}

export class ListPromotionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  active?: string;
}

export class PreviewPromotionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stationId!: number;

  @ApiProperty({ example: '2026-11-02T12:00:00.000Z' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ example: '2026-11-02T14:00:00.000Z' })
  @IsISO8601()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;
}
