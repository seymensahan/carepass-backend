import { IsString, IsOptional, IsEmail } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInsuranceCompanyDto {
  @ApiPropertyOptional({ description: 'Nom de la compagnie d\'assurance' })
  @IsOptional()
  @IsString()
  name?: string;

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
}
