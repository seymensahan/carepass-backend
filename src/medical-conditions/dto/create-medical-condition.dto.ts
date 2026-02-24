import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConditionStatus } from '@prisma/client';

export class CreateMedicalConditionDto {
  @ApiProperty({ description: 'ID du patient' })
  @IsString()
  @IsNotEmpty({ message: "L'identifiant du patient est requis" })
  patientId: string;

  @ApiProperty({ description: 'Nom de la condition medicale' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom de la condition est requis' })
  name: string;

  @ApiPropertyOptional({ description: 'Date de diagnostic (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date doit etre au format ISO 8601' })
  diagnosedAt?: string;

  @ApiPropertyOptional({
    description: 'Statut de la condition',
    enum: ConditionStatus,
    default: ConditionStatus.active,
  })
  @IsOptional()
  @IsEnum(ConditionStatus, { message: 'Le statut est invalide' })
  status?: ConditionStatus;

  @ApiPropertyOptional({ description: 'Traitement en cours' })
  @IsOptional()
  @IsString()
  treatment?: string;

  @ApiPropertyOptional({ description: 'Notes supplementaires' })
  @IsOptional()
  @IsString()
  notes?: string;
}
