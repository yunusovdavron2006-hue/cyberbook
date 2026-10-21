import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { BookingStatus } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clubId!: number;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stationId!: number;

  @ApiProperty({ example: '2026-11-02T12:00:00.000Z', description: 'UTC ISO-8601 — start (inclusive)' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ example: '2026-11-02T14:00:00.000Z', description: 'UTC ISO-8601 — end (exclusive)' })
  @IsISO8601()
  endsAt!: string;

  @ApiPropertyOptional({
    description: 'Client-generated key preventing duplicate submissions.',
    example: 'a1b2c3d4-...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;

  @ApiPropertyOptional({ enum: ['PAY_AT_CLUB', 'ONLINE'], default: 'PAY_AT_CLUB' })
  @IsOptional()
  @IsEnum({ PAY_AT_CLUB: 'PAY_AT_CLUB', ONLINE: 'ONLINE' })
  paymentMethod?: 'PAY_AT_CLUB' | 'ONLINE';

  @ApiPropertyOptional({ description: 'Optional promotion code to apply to this booking' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  promoCode?: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional({ example: 'Plans changed' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: BookingStatus })
  @IsEnum(BookingStatus)
  status!: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ListBookingsQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsString()
  date?: string;

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
