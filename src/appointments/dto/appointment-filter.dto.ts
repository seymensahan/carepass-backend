import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AppointmentStatus } from '@prisma/client';

export class AppointmentFilterDto {
  @ApiPropertyOptional({ description: 'Numéro de page', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Nombre d\'éléments par page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus, { message: 'Le statut est invalide' })
  status?: AppointmentStatus;

  @ApiPropertyOptional({ description: 'Date de début (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de début doit être au format ISO 8601' })
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Date de fin (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit être au format ISO 8601' })
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Filtrer par patient' })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par médecin' })
  @IsOptional()
  @IsString()
  doctorId?: string;
}
