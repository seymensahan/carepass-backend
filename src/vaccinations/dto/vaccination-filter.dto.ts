import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VaccinationStatus } from '@prisma/client';

export class VaccinationFilterDto {
  @ApiPropertyOptional({ description: 'Numero de page', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: "Nombre d'elements par page", default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filtrer par patient' })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par enfant' })
  @IsOptional()
  @IsString()
  childId?: string;

  @ApiPropertyOptional({ description: 'Filtrer par statut', enum: VaccinationStatus })
  @IsOptional()
  @IsEnum(VaccinationStatus, { message: 'Le statut est invalide' })
  status?: VaccinationStatus;
}
