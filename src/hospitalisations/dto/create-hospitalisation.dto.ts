import { IsString, IsOptional, IsDateString, IsUUID, IsArray, ValidateNested, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class CarePlanItemDto {
  @IsString()
  task: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsIn(['routine', 'urgent', 'critical'])
  priority?: string;
}

export class CreateHospitalisationDto {
  @ApiProperty({ description: 'Patient ID (UUID ou CaryPass ID ex: CP-2025-00001)' })
  @IsString()
  patientId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() institutionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() room?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bed?: string;
  @ApiProperty() @IsDateString() admissionDate: string;
  @ApiProperty() @IsString() reason: string;
  @ApiPropertyOptional() @IsOptional() @IsString() diagnosis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;

  @ApiPropertyOptional({ description: 'Cahier de charges infirmier', type: [CarePlanItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CarePlanItemDto)
  carePlanItems?: CarePlanItemDto[];
}
