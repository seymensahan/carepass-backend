import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHospitalisationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() room?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bed?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() diagnosis?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(['en_cours', 'terminee', 'transferee']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dischargeDate?: string;
}
