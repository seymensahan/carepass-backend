import { IsString, IsOptional, IsEnum, IsInt, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @ApiProperty({ description: 'Terme de recherche', minLength: 2 })
  @IsString({ message: 'Le terme de recherche doit etre une chaine de caracteres' })
  @MinLength(2, { message: 'Le terme de recherche doit contenir au moins 2 caracteres' })
  q: string;

  @ApiPropertyOptional({ description: 'Type de recherche', enum: ['patients', 'doctors', 'all'] })
  @IsOptional()
  @IsEnum(['patients', 'doctors', 'all'], { message: 'Le type doit etre patients, doctors ou all' })
  type?: 'patients' | 'doctors' | 'all';

  @ApiPropertyOptional({ description: 'Nombre maximum de resultats', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit etre un entier' })
  @Min(1, { message: 'La limite doit etre au moins 1' })
  limit?: number = 10;
}
