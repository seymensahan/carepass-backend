import { IsString, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHospitalisationDto {
  @ApiProperty({ description: 'Patient ID (UUID ou CarePass ID ex: CP-2025-00001)' })
  @IsString()
  patientId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() institutionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() room?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bed?: string;
  @ApiProperty() @IsDateString() admissionDate: string;
  @ApiProperty() @IsString() reason: string;
  @ApiPropertyOptional() @IsOptional() @IsString() diagnosis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
