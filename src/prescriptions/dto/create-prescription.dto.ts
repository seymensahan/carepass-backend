import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class PrescriptionItemDto {
  @ApiProperty({ description: 'Nom du medicament' })
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

export class CreatePrescriptionDto {
  @ApiProperty({ description: 'ID de la consultation' })
  @IsString()
  @IsNotEmpty({ message: 'L\'identifiant de la consultation est requis' })
  consultationId: string;

  @ApiProperty({ description: 'ID du patient' })
  @IsString()
  @IsNotEmpty({ message: 'L\'identifiant du patient est requis' })
  patientId: string;

  @ApiPropertyOptional({ description: 'Notes supplementaires' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Liste des medicaments prescrits',
    type: [PrescriptionItemDto],
  })
  @IsArray({ message: 'Les elements de prescription doivent etre un tableau' })
  @ArrayMinSize(1, { message: 'Au moins un medicament doit etre prescrit' })
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items: PrescriptionItemDto[];
}
