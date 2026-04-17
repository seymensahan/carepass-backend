import { IsOptional, IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CustomVitalDto {
  @ApiPropertyOptional({ description: 'Nom du paramètre', example: 'Diurèse' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Valeur mesurée', example: '500' })
  @IsString()
  value: string;

  @ApiPropertyOptional({ description: 'Unité de mesure', example: 'ml' })
  @IsOptional()
  @IsString()
  unit?: string;
}

export class ExecuteCarePlanItemDto {
  @ApiPropertyOptional({ description: 'Notes / observations' })
  @IsOptional()
  @IsString()
  notes?: string;

  // Vital sign fields (used when executing a vital_check task)
  @ApiPropertyOptional() @IsOptional() @IsNumber() temperature?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() systolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() diastolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() heartRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() spO2?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() glycemia?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weight?: number;

  // Custom vital parameters added on the fly by the nurse
  @ApiPropertyOptional({ type: [CustomVitalDto], description: 'Paramètres vitaux personnalisés' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomVitalDto)
  customVitals?: CustomVitalDto[];
}
