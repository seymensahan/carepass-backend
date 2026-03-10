import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePregnancyDto {
  @ApiProperty({ example: '2026-01-15', description: 'Date de début de grossesse (dernières règles)' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ example: '2026-10-22', description: 'Date prévue d\'accouchement (calculée automatiquement si non fournie)' })
  @IsOptional()
  @IsDateString()
  expectedDueDate?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
