import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';

export class CreateChildDto {
  @ApiProperty({ description: 'Prénom de l\'enfant' })
  @IsString({ message: 'Le prénom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le prénom est requis' })
  firstName: string;

  @ApiProperty({ description: 'Nom de famille de l\'enfant' })
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le nom est requis' })
  lastName: string;

  @ApiProperty({ description: 'Date de naissance (ISO 8601)' })
  @IsDateString({}, { message: 'La date de naissance doit être au format ISO 8601' })
  @IsNotEmpty({ message: 'La date de naissance est requise' })
  dateOfBirth: string;

  @ApiPropertyOptional({ description: 'Genre', enum: Gender })
  @IsOptional()
  @IsEnum(Gender, { message: 'Le genre doit être M ou F' })
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Groupe sanguin' })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional({ description: 'Génotype (AA, AS, SS, AC, SC)' })
  @IsOptional()
  @IsString()
  genotype?: string;

  @ApiPropertyOptional({ description: 'Poids en kg' })
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiPropertyOptional({ description: 'Taille en cm' })
  @IsOptional()
  @IsNumber()
  heightCm?: number;

  @ApiPropertyOptional({ description: 'Type de dépendant: child, elderly, disabled' })
  @IsOptional()
  @IsString()
  dependentType?: string;
}
