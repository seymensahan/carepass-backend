import { IsString, IsOptional, IsNumber, IsInt, IsBoolean, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: 'Nom du plan' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Slug unique du plan' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ description: 'Description du plan' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Prix mensuel' })
  @IsOptional()
  @IsNumber({}, { message: 'Le prix mensuel doit etre un nombre' })
  priceMonthly?: number;

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

  @ApiPropertyOptional({ description: 'Plan actif' })
  @IsOptional()
  @IsBoolean({ message: 'Le champ isActive doit etre un booleen' })
  isActive?: boolean;
}
