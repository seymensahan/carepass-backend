import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  ValidateNested,
  ArrayMinSize,
  IsNotEmpty,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PrescriptionStatus } from '@prisma/client';

class UpdatePrescriptionItemDto {
  @ApiPropertyOptional({ description: 'Nom du medicament' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom du medicament est requis' })
  medication: string;

  @ApiPropertyOptional({ description: 'Dosage' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ description: 'Frequence de prise' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ description: 'Duree du traitement' })
  @IsOptional()
  @IsString()
  duration?: string;

  @ApiPropertyOptional({ description: 'Instructions supplementaires' })
  @IsOptional()
  @IsString()
  instructions?: string;
}

export class UpdatePrescriptionDto {
  @ApiPropertyOptional({ description: 'Notes supplementaires' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Statut de la prescription',
    enum: PrescriptionStatus,
  })
  @IsOptional()
  @IsEnum(PrescriptionStatus, { message: 'Le statut est invalide' })
  status?: PrescriptionStatus;

  @ApiPropertyOptional({
    description: 'Liste des medicaments (remplace tous les elements existants)',
    type: [UpdatePrescriptionItemDto],
  })
  @IsOptional()
  @IsArray({ message: 'Les elements de prescription doivent etre un tableau' })
  @ArrayMinSize(1, { message: 'Au moins un medicament doit etre prescrit' })
  @ValidateNested({ each: true })
  @Type(() => UpdatePrescriptionItemDto)
  items?: UpdatePrescriptionItemDto[];
}
