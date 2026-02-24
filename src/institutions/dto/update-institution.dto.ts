import { IsString, IsOptional, IsEnum, IsEmail } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InstitutionType } from '@prisma/client';

export class UpdateInstitutionDto {
  @ApiPropertyOptional({ description: 'Nom de l\'institution' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Type d\'institution', enum: InstitutionType })
  @IsOptional()
  @IsEnum(InstitutionType, { message: 'Le type d\'institution est invalide' })
  type?: InstitutionType;

  @ApiPropertyOptional({ description: 'Numero d\'enregistrement' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Adresse' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Region' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Telephone' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Adresse email' })
  @IsOptional()
  @IsEmail({}, { message: 'L\'adresse email est invalide' })
  email?: string;

  @ApiPropertyOptional({ description: 'URL du logo' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'ID de l\'utilisateur administrateur' })
  @IsOptional()
  @IsString()
  adminUserId?: string;
}
