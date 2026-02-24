import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ConsultationType, ConsultationStatus } from '@prisma/client';

export class ConsultationFilterDto {
  @ApiPropertyOptional({ description: 'Numero de page', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Nombre d\'elements par page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Recherche par motif ou diagnostic' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer par patient' })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par medecin' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: ConsultationStatus })
  @IsOptional()
  @IsEnum(ConsultationStatus, { message: 'Le statut est invalide' })
  status?: ConsultationStatus;

  @ApiPropertyOptional({ description: 'Filtrer par type', enum: ConsultationType })
  @IsOptional()
  @IsEnum(ConsultationType, { message: 'Le type est invalide' })
  type?: ConsultationType;

  @ApiPropertyOptional({ description: 'Date de debut (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de debut doit etre au format ISO 8601' })
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Date de fin (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit etre au format ISO 8601' })
  dateTo?: string;
}
