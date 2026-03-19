import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddMedicationDto {
  @ApiProperty() @IsString() medication: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dosage?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(['PO', 'IV', 'IM', 'SC', 'inhalation', 'topical']) route?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() administeredBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}
