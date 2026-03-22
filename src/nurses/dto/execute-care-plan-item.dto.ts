import { IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
}
