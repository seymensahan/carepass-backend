import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsObject,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ConsultationType, Severity, ConsultationStatus } from '@prisma/client';

class VitalSignsDto {
  @ApiPropertyOptional({ description: 'Temperature en degres Celsius' })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({ description: 'Frequence cardiaque (bpm)' })
  @IsOptional()
  @IsNumber()
  heartRate?: number;

  @ApiPropertyOptional({ description: 'Tension arterielle (ex: 120/80)' })
  @IsOptional()
  @IsString()
  bloodPressure?: string;

  @ApiPropertyOptional({ description: 'Poids en kg' })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ description: 'Taille en cm' })
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional({ description: 'Saturation en oxygene (%)' })
  @IsOptional()
  @IsNumber()
  oxygenSaturation?: number;
}

class PrescriptionItemDto {
  @ApiProperty({ description: 'Nom du medicament' })
  @IsString()
  @IsNotEmpty()
  medication: string;

  @ApiPropertyOptional({ description: 'Dosage' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Frequence' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Duree du traitement' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateConsultationDto {
  @ApiProperty({ description: 'ID du patient' })
  @IsString()
  @IsNotEmpty({ message: 'L\'identifiant du patient est requis' })
  patientId: string;

  @ApiProperty({ description: 'Date de la consultation (ISO 8601)' })
  @IsDateString({}, { message: 'La date doit etre au format ISO 8601' })
  @IsNotEmpty({ message: 'La date est requise' })
  date: string;

  @ApiPropertyOptional({
    description: 'Type de consultation',
    enum: ConsultationType,
    default: ConsultationType.consultation,
  })
  @IsOptional()
  @IsEnum(ConsultationType, { message: 'Le type de consultation est invalide' })
  type?: ConsultationType;

  @ApiProperty({ description: 'Motif de la consultation' })
  @IsString()
  @IsNotEmpty({ message: 'Le motif est requis' })
  motif: string;

  @ApiPropertyOptional({ description: 'Symptomes du patient' })
  @IsOptional()
  @IsString()
  symptoms?: string;

  @ApiPropertyOptional({ description: 'Diagnostic' })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({ description: 'Notes supplementaires' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Severite',
    enum: Severity,
  })
  @IsOptional()
  @IsEnum(Severity, { message: 'La severite est invalide' })
  severity?: Severity;

  @ApiPropertyOptional({
    description: 'Signes vitaux',
    type: VitalSignsDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => VitalSignsDto)
  vitalSigns?: VitalSignsDto;

  @ApiPropertyOptional({
    description: 'Statut de la consultation',
    enum: ConsultationStatus,
  })
  @IsOptional()
  @IsEnum(ConsultationStatus, { message: 'Le statut est invalide' })
  status?: ConsultationStatus;

  @ApiPropertyOptional({
    description: 'Liste des medicaments prescrits',
    type: [PrescriptionItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  prescriptions?: PrescriptionItemDto[];

  @ApiPropertyOptional({
    description: 'Liste des analyses labo demandees',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labOrders?: string[];
}
