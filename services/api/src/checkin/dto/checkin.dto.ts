import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CheckInTokenDto {
  @ApiProperty({ description: 'Opaque check-in token from the QR code' })
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  token!: string;
}
