import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class RedeemPointsDto {
  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points!: number;

  @ApiPropertyOptional({ description: 'Idempotency key to make redemption retry-safe' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}

export class ApplyReferralDto {
  @ApiProperty({ example: 'AB12CD34' })
  @IsString()
  @MinLength(4)
  @MaxLength(24)
  code!: string;
}

export class AdjustPointsDto {
  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiProperty({ example: 250, description: 'Signed points; may be negative to debit' })
  @Type(() => Number)
  @IsInt()
  points!: number;

  @ApiProperty({ example: 'Goodwill credit' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;
}

export class ListLedgerQueryDto {
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
