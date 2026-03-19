import { IsOptional, IsNumber, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AddVitalDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() temperature?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() systolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() diastolic?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() heartRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() spO2?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() glycemia?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() nurseName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
