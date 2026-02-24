import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional({ description: 'Langue preferee', enum: ['fr', 'en'] })
  @IsOptional()
  @IsEnum(['fr', 'en'], { message: 'La langue doit etre fr ou en' })
  language?: 'fr' | 'en';

  @ApiPropertyOptional({ description: 'Activer les notifications' })
  @IsOptional()
  @IsBoolean({ message: 'Les notifications doivent etre un booleen' })
  notifications?: boolean;

  @ApiPropertyOptional({ description: 'Theme de l\'interface', enum: ['light', 'dark'] })
  @IsOptional()
  @IsEnum(['light', 'dark'], { message: 'Le theme doit etre light ou dark' })
  theme?: 'light' | 'dark';
}
