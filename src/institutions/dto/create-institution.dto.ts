import { IsString, IsNotEmpty, IsOptional, IsEnum, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstitutionType } from '@prisma/client';

export class CreateInstitutionDto {
  @ApiProperty({ description: 'Nom de l\'institution' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom est requis' })
  name: string;

  @ApiProperty({ description: 'Type d\'institution', enum: InstitutionType })
  @IsEnum(InstitutionType, { message: 'Le type d\'institution est invalide' })
  @IsNotEmpty({ message: 'Le type est requis' })
  type: InstitutionType;

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

  @ApiPropertyOptional({ description: 'ID de l\'utilisateur administrateur' })
  @IsOptional()
  @IsString()
  adminUserId?: string;
}
