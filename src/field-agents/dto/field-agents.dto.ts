import {
  IsString,
  IsOptional,
  IsIn,
  IsBoolean,
  IsNumber,
  IsDateString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Field Visit DTOs
// ---------------------------------------------------------------------------

export class CreateFieldVisitDto {
  @ApiProperty({ example: 'Jean Kamga' })
  @IsString()
  targetName: string;

  @ApiPropertyOptional({ example: '6XXXXXXXX' })
  @IsOptional()
  @IsString()
  targetPhone?: string;

  @ApiProperty({ example: 'patient', enum: ['patient', 'doctor', 'nurse'] })
  @IsString()
  @IsIn(['patient', 'doctor', 'nurse'])
  targetRole: string;

  @ApiPropertyOptional({ example: 'Hôpital Central, Yaoundé' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Yaoundé' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Notes sur la visite' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: '2026-04-10T09:00:00Z' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class UpdateFieldVisitDto {
  @ApiPropertyOptional({ enum: ['planned', 'in_progress', 'completed', 'cancelled'] })
  @IsOptional()
  @IsIn(['planned', 'in_progress', 'completed', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ enum: ['interested', 'not_interested', 'follow_up', 'onboarded'] })
  @IsOptional()
  @IsIn(['interested', 'not_interested', 'follow_up', 'onboarded'])
  outcome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'GPS check-in latitude' })
  @IsOptional()
  @IsNumber()
  checkInLat?: number;

  @ApiPropertyOptional({ description: 'GPS check-in longitude' })
  @IsOptional()
  @IsNumber()
  checkInLng?: number;

  @ApiPropertyOptional({ description: 'GPS check-out latitude' })
  @IsOptional()
  @IsNumber()
  checkOutLat?: number;

  @ApiPropertyOptional({ description: 'GPS check-out longitude' })
  @IsOptional()
  @IsNumber()
  checkOutLng?: number;
}

// ---------------------------------------------------------------------------
// User Onboarding DTOs
// ---------------------------------------------------------------------------

export class CreateOnboardingDto {
  @ApiProperty({ example: 'Marie Kamga' })
  @IsString()
  userName: string;

  @ApiProperty({ example: '6XXXXXXXX' })
  @IsString()
  userPhone: string;

  @ApiPropertyOptional({ example: 'marie@example.com' })
  @IsOptional()
  @IsString()
  userEmail?: string;

  @ApiProperty({ example: 'patient', enum: ['patient', 'doctor', 'nurse'] })
  @IsString()
  @IsIn(['patient', 'doctor', 'nurse'])
  userRole: string;

  @ApiPropertyOptional({ example: 'dentiste', enum: ['dentiste', 'gynecologue', 'pediatre', 'generaliste', 'ophtalmologue'] })
  @IsOptional()
  @IsIn(['dentiste', 'gynecologue', 'pediatre', 'generaliste', 'ophtalmologue'])
  doctorSpecialty?: string;

  @ApiPropertyOptional({ example: 'Douala' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Akwa' })
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional({ description: 'ID de la visite terrain liée' })
  @IsOptional()
  @IsString()
  fieldVisitId?: string;
}

export class UpdateOnboardingDto {
  @ApiPropertyOptional({ enum: ['pending', 'in_progress', 'completed', 'rejected'] })
  @IsOptional()
  @IsIn(['pending', 'in_progress', 'completed', 'rejected'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  appDownloaded?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  accountCreated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  voucherRedeemed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
