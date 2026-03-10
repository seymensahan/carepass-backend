import { IsDateString, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PregnancyStatus } from '@prisma/client';

export class UpdatePregnancyDto {
  @ApiPropertyOptional({ enum: PregnancyStatus, description: 'Statut de la grossesse' })
  @IsOptional()
  @IsEnum(PregnancyStatus)
  status?: PregnancyStatus;

  @ApiPropertyOptional({ example: '2026-10-22', description: 'Date prévue d\'accouchement mise à jour' })
  @IsOptional()
  @IsDateString()
  expectedDueDate?: string;

  @ApiPropertyOptional({ example: '2026-10-20', description: 'Date de fin réelle (accouchement)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Complications (JSON)' })
  @IsOptional()
  complications?: any;
}
