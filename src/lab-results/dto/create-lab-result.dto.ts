import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { LabCategory } from '@prisma/client';

class LabResultItemDto {
  @ApiProperty({ description: 'Nom du parametre' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du parametre est requis' })
  name: string;

  @ApiProperty({ description: 'Valeur du resultat' })
  @IsString()
  @IsNotEmpty({ message: 'La valeur est requise' })
  value: string;

  @ApiPropertyOptional({ description: 'Unite de mesure' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Plage de reference' })
  @IsOptional()
  @IsString()
  referenceRange?: string;

  @ApiPropertyOptional({ description: 'Resultat anormal', default: false })
  @IsOptional()
  @IsBoolean()
  isAbnormal?: boolean;
}

export class CreateLabResultDto {
  @ApiProperty({ description: 'ID du patient' })
  @IsString()
  @IsNotEmpty({ message: "L'identifiant du patient est requis" })
  patientId: string;

  @ApiProperty({ description: 'Titre du resultat' })
  @IsString()
  @IsNotEmpty({ message: 'Le titre est requis' })
  title: string;

  @ApiPropertyOptional({
    description: 'Categorie du resultat',
    enum: LabCategory,
    default: LabCategory.autre,
  })
  @IsOptional()
  @IsEnum(LabCategory, { message: 'La categorie est invalide' })
  category?: LabCategory;

  @ApiProperty({ description: "URL du fichier d'analyse" })
  @IsString()
  @IsNotEmpty({ message: "L'URL du fichier est requise" })
  fileUrl: string;

  @ApiProperty({ description: 'Date du resultat (ISO 8601)' })
  @IsDateString({}, { message: 'La date doit etre au format ISO 8601' })
  @IsNotEmpty({ message: 'La date est requise' })
  date: string;

  @ApiPropertyOptional({ description: "ID de l'institution" })
  @IsOptional()
  @IsString()
  institutionId?: string;

  @ApiPropertyOptional({ description: 'Notes supplementaires' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Elements du resultat',
    type: [LabResultItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LabResultItemDto)
  items?: LabResultItemDto[];
}
