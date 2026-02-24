import { IsDateString, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class UpdatePatientDto {
  @ApiPropertyOptional({ example: '1995-06-15', description: 'Date de naissance (format ISO)' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender, example: 'M', description: 'Genre (M ou F)' })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: 'O+', description: 'Groupe sanguin' })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'AS', description: 'Genotype' })
  @IsOptional()
  @IsString()
  genotype?: string;

  @ApiPropertyOptional({ example: '123 Rue de la Paix', description: 'Adresse' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Douala', description: 'Ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Littoral', description: 'Region' })
  @IsOptional()
  @IsString()
  region?: string;
}
