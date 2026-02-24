import { IsString, IsNotEmpty, IsOptional, IsNumber, IsInt, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiProperty({ description: 'Nom du plan' })
  @IsString()
  @IsNotEmpty({ message: 'Le nom est requis' })
  name: string;

  @ApiProperty({ description: 'Slug unique du plan' })
  @IsString()
  @IsNotEmpty({ message: 'Le slug est requis' })
  slug: string;

  @ApiPropertyOptional({ description: 'Description du plan' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Prix mensuel' })
  @IsNumber({}, { message: 'Le prix mensuel doit etre un nombre' })
  @IsNotEmpty({ message: 'Le prix mensuel est requis' })
  priceMonthly: number;

  @ApiPropertyOptional({ description: 'Prix annuel' })
  @IsOptional()
  @IsNumber({}, { message: 'Le prix annuel doit etre un nombre' })
  priceYearly?: number;

  @ApiPropertyOptional({ description: 'Fonctionnalites du plan (JSON)' })
  @IsOptional()
  @IsObject({ message: 'Les fonctionnalites doivent etre un objet JSON' })
  features?: any;

  @ApiPropertyOptional({ description: 'Nombre maximum de patients' })
  @IsOptional()
  @IsInt({ message: 'Le nombre de patients doit etre un entier' })
  maxPatients?: number;

  @ApiPropertyOptional({ description: 'Nombre maximum de medecins' })
  @IsOptional()
  @IsInt({ message: 'Le nombre de medecins doit etre un entier' })
  maxDoctors?: number;
}
