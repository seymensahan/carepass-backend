import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateAppointmentDto {
  @ApiPropertyOptional({ description: 'ID du patient (requis si créé par un médecin)' })
  @IsOptional()
  @IsString({ message: 'L\'identifiant du patient doit être une chaîne de caractères' })
  patientId?: string;

  @ApiPropertyOptional({ description: 'ID du médecin (requis si créé par un patient)' })
  @IsOptional()
  @IsString({ message: 'L\'identifiant du médecin doit être une chaîne de caractères' })
  doctorId?: string;

  @ApiProperty({ description: 'Date du rendez-vous (ISO 8601)' })
  @IsDateString({}, { message: 'La date doit être au format ISO 8601' })
  @IsNotEmpty({ message: 'La date est requise' })
  date: string;

  @ApiPropertyOptional({ description: 'Durée en minutes', default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La durée doit être un nombre entier' })
  @Min(1, { message: 'La durée doit être d\'au moins 1 minute' })
  duration?: number;

  @ApiPropertyOptional({ description: 'Type de rendez-vous' })
  @IsOptional()
  @IsString({ message: 'Le type doit être une chaîne de caractères' })
  type?: string;

  @ApiPropertyOptional({ description: 'Motif du rendez-vous' })
  @IsOptional()
  @IsString({ message: 'Le motif doit être une chaîne de caractères' })
  reason?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString({ message: 'Les notes doivent être une chaîne de caractères' })
  notes?: string;
}
