import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NurseInitiateConsultationDto {
  @ApiProperty({ description: 'CaryPass ID ou UUID du patient' })
  @IsString()
  @IsNotEmpty()
  patientId: string;

  @ApiProperty({ description: 'Motif de la visite' })
  @IsString()
  @IsNotEmpty()
  motif: string;

  // Vital signs
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  heartRate?: number;

  @ApiPropertyOptional({ description: 'ex: 120/80' })
  @IsOptional()
  @IsString()
  bloodPressure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  oxygenSaturation?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  respiratoryRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vitalNotes?: string;
}

export class TransferConsultationDto {
  @ApiPropertyOptional({ description: 'ID du docteur CaryPass (si interne)' })
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({ description: 'Nom du docteur externe' })
  @IsOptional()
  @IsString()
  externalDoctorName?: string;

  @ApiPropertyOptional({ description: 'Spécialité du docteur externe' })
  @IsOptional()
  @IsString()
  externalDoctorSpecialty?: string;

  @ApiPropertyOptional({ description: 'Téléphone du docteur externe' })
  @IsOptional()
  @IsString()
  externalDoctorPhone?: string;
}
