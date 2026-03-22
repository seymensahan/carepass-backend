import { IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddVitalNurseDto {
  @ApiProperty() @IsString() hospitalisationId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() temperature?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() systolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() diastolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() heartRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() spO2?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() glycemia?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
