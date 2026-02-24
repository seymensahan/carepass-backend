import { IsOptional, IsString, IsEnum, IsInt, Min, Max, IsBooleanString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InstitutionType } from '@prisma/client';

export class InstitutionFilterDto {
  @ApiPropertyOptional({ description: 'Numero de page', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Nombre d\'elements par page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Recherche par nom' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer par type', enum: InstitutionType })
  @IsOptional()
  @IsEnum(InstitutionType, { message: 'Le type d\'institution est invalide' })
  type?: InstitutionType;

  @ApiPropertyOptional({ description: 'Filtrer par ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Filtrer par statut de verification (true/false)' })
  @IsOptional()
  @IsBooleanString({ message: 'Le champ verified doit etre true ou false' })
  verified?: string;
}
