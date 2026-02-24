import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VaccinationStatus } from '@prisma/client';

export class CreateVaccinationDto {
  @ApiProperty({ description: 'ID du patient' })
  @IsString()
  @IsNotEmpty({ message: "L'identifiant du patient est requis" })
  patientId: string;

  @ApiPropertyOptional({ description: "ID de l'enfant" })
  @IsOptional()
  @IsString()
  childId?: string;

  @ApiProperty({ description: 'Nom du vaccin' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du vaccin est requis' })
  name: string;

  @ApiProperty({ description: 'Date de vaccination (ISO 8601)' })
  @IsDateString({}, { message: 'La date doit etre au format ISO 8601' })
  @IsNotEmpty({ message: 'La date est requise' })
  date: string;

  @ApiPropertyOptional({ description: 'Date de rappel (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de rappel doit etre au format ISO 8601' })
  boosterDate?: string;

  @ApiPropertyOptional({ description: 'Numero de lot' })
  @IsOptional()
  @IsString()
  lot?: string;

  @ApiPropertyOptional({ description: 'Administre par' })
  @IsOptional()
  @IsString()
  administeredBy?: string;

  @ApiPropertyOptional({ description: 'Lieu de vaccination' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({
    description: 'Statut de la vaccination',
    enum: VaccinationStatus,
    default: VaccinationStatus.done,
  })
  @IsOptional()
  @IsEnum(VaccinationStatus, { message: 'Le statut est invalide' })
  status?: VaccinationStatus;

  @ApiPropertyOptional({ description: 'Notes supplementaires' })
  @IsOptional()
  @IsString()
  notes?: string;
}
