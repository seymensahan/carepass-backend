import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Severity } from '@prisma/client';

export class CreateAllergyDto {
  @ApiProperty({ description: 'ID du patient' })
  @IsString()
  @IsNotEmpty({ message: "L'identifiant du patient est requis" })
  patientId: string;

  @ApiProperty({ description: "Nom de l'allergene" })
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'allergie est requis" })
  name: string;

  @ApiPropertyOptional({
    description: 'Severite',
    enum: Severity,
  })
  @IsOptional()
  @IsEnum(Severity, { message: 'La severite est invalide' })
  severity?: Severity;

  @ApiPropertyOptional({ description: 'Reaction allergique' })
  @IsOptional()
  @IsString()
  reaction?: string;

  @ApiPropertyOptional({ description: 'Date de diagnostic (ISO 8601)' })
  @IsOptional()
  @IsDateString({}, { message: 'La date doit etre au format ISO 8601' })
  diagnosedAt?: string;

  @ApiPropertyOptional({ description: 'Notes supplementaires' })
  @IsOptional()
  @IsString()
  notes?: string;
}
