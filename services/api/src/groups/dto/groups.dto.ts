import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GroupParticipantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}

export class CreateGroupBookingDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  clubId!: number;

  @ApiProperty({ example: '2026-11-02T12:00:00.000Z' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty({ example: '2026-11-02T14:00:00.000Z' })
  @IsISO8601()
  endsAt!: string;

  @ApiProperty({ example: [1, 2, 3], description: '2–20 stations to reserve for the group' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  stationIds!: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  promoCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;

  @ApiPropertyOptional({ type: [GroupParticipantDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GroupParticipantDto)
  participants?: GroupParticipantDto[];
}

export class CreateGroupInvitesDto {
  @ApiProperty({ type: [GroupParticipantDto], description: 'Friends to invite to the group booking' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GroupParticipantDto)
  invitees!: GroupParticipantDto[];
}

export class RespondToInviteDto {
  @ApiProperty({ description: 'Raw invitation token from the invite link' })
  @IsString()
  @MaxLength(200)
  token!: string;

  @ApiProperty({ enum: ['accept', 'decline'] })
  @IsString()
  @IsIn(['accept', 'decline'])
  action!: 'accept' | 'decline';
}
