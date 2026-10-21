import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateStationDto {
  @ApiProperty({ example: 'Station 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @ApiProperty({ enum: ['PC', 'VIP_PC', 'BOOTCAMP', 'CONSOLE'], example: 'PC' })
  @IsString()
  categoryKey!: string;

  @ApiProperty({ description: 'Base hourly price in integer UZS', example: 25000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pricePerHour!: number;

  @ApiPropertyOptional({
    description: 'Free-form hardware specification',
    example: { cpu: 'Ryzen 5 5600', gpu: 'RTX 3060', ram: '16GB', monitor: '144Hz' },
  })
  @IsOptional()
  @IsObject()
  specs?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Zone label used by the 2D floor plan layout',
    example: 'STANDARD',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  zone?: string;

  @ApiPropertyOptional({ description: 'Floor-plan X coordinate (grid units)', example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mapX?: number;

  @ApiPropertyOptional({ description: 'Floor-plan Y coordinate (grid units)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mapY?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateStationDto extends CreateStationDto {}

export class StationStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE'] })
  @IsString()
  status!: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
}

export class BulkCreateStationsDto {
  @ApiProperty({ example: 10, description: 'How many stations to create' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  count!: number;

  @ApiProperty({ enum: ['PC', 'VIP_PC', 'BOOTCAMP', 'CONSOLE'] })
  @IsString()
  categoryKey!: string;

  @ApiProperty({ description: 'Base hourly price in integer UZS' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pricePerHour!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  specs?: Record<string, unknown>;

  @ApiPropertyOptional({ default: 'Station' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  labelPrefix?: string;
}

export class StationLayoutItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stationId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  zone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mapX?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  mapY?: number;
}

export class UpdateStationLayoutDto {
  @ApiProperty({ type: [StationLayoutItemDto] })
  @IsArray()
  items!: StationLayoutItemDto[];
}

export class CreatePricingRuleDto {
  @ApiProperty({ example: 'Night rate' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ['PER_HOUR', 'FLAT'] })
  @IsString()
  unit!: 'PER_HOUR' | 'FLAT';

  @ApiProperty({ description: 'Amount in integer UZS' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  stationId?: number;

  @ApiPropertyOptional({ enum: ['PC', 'VIP_PC', 'BOOTCAMP', 'CONSOLE'] })
  @IsOptional()
  @IsString()
  categoryKey?: string;

  @ApiPropertyOptional({ example: [0, 1, 2, 3, 4], description: '0=Mon … 6=Sun; empty = all days' })
  @IsOptional()
  @Type(() => Number)
  dayOfWeeks?: number[];

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  startsAtTime?: string;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  endsAtTime?: string;

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
