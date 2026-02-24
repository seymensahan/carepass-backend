import { IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportFilterDto {
  @ApiPropertyOptional({ description: 'Date de debut (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de debut doit etre au format ISO 8601' })
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Date de fin (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit etre au format ISO 8601' })
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Format d\'export', enum: ['csv', 'json'], default: 'json' })
  @IsOptional()
  @IsEnum(['csv', 'json'], { message: 'Le format doit etre csv ou json' })
  format?: 'csv' | 'json' = 'json';
}
