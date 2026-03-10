import { IsDateString, IsOptional, IsString, IsEnum, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'inconnu'];

export class CreatePatientDto {
  @ApiProperty({ example: '1995-06-15', description: 'Date de naissance (format ISO)' })
  @IsDateString()
  dateOfBirth: string;

  @ApiPropertyOptional({ enum: Gender, example: 'M', description: 'Genre (M ou F)' })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({
    example: 'O+',
    description: 'Groupe sanguin (A+, A-, B+, B-, AB+, AB-, O+, O-, inconnu)',
    enum: BLOOD_GROUPS,
  })
  @IsOptional()
  @IsIn(BLOOD_GROUPS, { message: 'Groupe sanguin invalide. Valeurs acceptées: A+, A-, B+, B-, AB+, AB-, O+, O-, inconnu' })
  bloodGroup?: string;

  @ApiPropertyOptional({ example: 'AS', description: 'Genotype (AA, AS, SS, AC, SC, inconnu)' })
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
