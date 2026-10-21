import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DayHoursDto {
  @ApiProperty({ example: 0, description: '0=Monday … 6=Sunday' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  closed!: boolean;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @Matches(HHMM, { message: 'opensAt must be HH:mm' })
  opensAt?: string;

  @ApiPropertyOptional({ example: '23:00', description: 'May be earlier than opensAt for overnight shifts' })
  @IsOptional()
  @Matches(HHMM, { message: 'closesAt must be HH:mm' })
  closesAt?: string;
}

export class SetOperatingHoursDto {
  @ApiProperty({ type: [DayHoursDto] })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => DayHoursDto)
  days!: DayHoursDto[];
}

export class CreateClosureDto {
  @ApiProperty({ example: '2026-11-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be yyyy-mm-dd' })
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
