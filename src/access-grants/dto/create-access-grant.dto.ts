import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccessGrantDto {
  @ApiProperty({ description: 'ID du médecin à qui accorder l\'accès', example: 'uuid-doctor-id' })
  @IsString()
  doctorId: string;

  @ApiPropertyOptional({ description: 'Portée de l\'accès', example: 'full', default: 'full' })
  @IsOptional()
  @IsString()
  scope?: string = 'full';

  @ApiPropertyOptional({ description: 'Date d\'expiration de l\'accès (ISO 8601)', example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
