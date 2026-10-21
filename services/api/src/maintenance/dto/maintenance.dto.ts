import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMaintenanceDto {
  @ApiProperty({ example: '2026-11-02T08:00:00.000Z' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ example: '2026-11-02T12:00:00.000Z' })
  @IsISO8601()
  endsAt!: string;

  @ApiPropertyOptional({ example: 'GPU replacement' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
