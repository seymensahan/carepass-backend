import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccessRequestDto {
  @ApiProperty({ description: 'Identifiant CarePass du patient', example: 'CP-2026-00001' })
  @IsString()
  patientCarepassId: string;

  @ApiPropertyOptional({ description: 'Motif de la demande d\'accès', example: 'Suivi médical régulier' })
  @IsOptional()
  @IsString()
  reason?: string;
}
