import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateClubDto {
  @ApiProperty({ example: 'Cyber Arena Tashkent' })
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ example: 'Tashkent' })
  @IsString()
  @MaxLength(80)
  city!: string;

  @ApiPropertyOptional({ example: 'Yunusabad' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiProperty({ example: 'Amir Temur ko\'chasi 12' })
  @IsString()
  @MaxLength(255)
  address!: string;

  @ApiProperty({ example: 41.311081 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 69.240562 })
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[+0-9 ()-]{7,20}$/)
  phone?: string;

  @ApiPropertyOptional({ example: 'Asia/Tashkent' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  coverImageUrl?: string;
}

export class UpdateClubDto extends CreateClubDto {}

export class RejectClubDto {
  @ApiProperty({ example: 'Club address could not be verified' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class SearchClubsDto {
  @ApiPropertyOptional({ description: 'Free-text search over club name, description and address' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /**
   * Legacy alias of `search`. Older clients (and the first version of the web
   * search form) send `q`; the global ValidationPipe rejects undeclared query
   * params, so it must be declared here to stay whitelisted.
   */
  @ApiPropertyOptional({ description: 'Alias of `search`, kept for older clients' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ example: 'Tashkent' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional({ description: 'Minimum price per hour in UZS' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price per hour in UZS' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: ['PC', 'VIP_PC', 'BOOTCAMP', 'CONSOLE'] })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  availableNow?: boolean;

  @ApiPropertyOptional({ enum: ['relevance', 'cheapest', 'rating', 'newest'] })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 12, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  size?: number;
}

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  address!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isMain?: boolean;
}

export class InviteStaffDto {
  @ApiProperty({ example: 'staff@example.com' })
  @IsString()
  @MaxLength(160)
  email!: string;

  @ApiPropertyOptional({ enum: ['MANAGER', 'STAFF'], default: 'STAFF' })
  @IsOptional()
  @IsString()
  role?: 'MANAGER' | 'STAFF';
}
