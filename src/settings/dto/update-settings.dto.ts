import { IsArray, ValidateNested, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SettingItemDto {
  @ApiProperty({ description: 'Cle du parametre' })
  @IsString({ message: 'La cle doit etre une chaine de caracteres' })
  @IsNotEmpty({ message: 'La cle ne peut pas etre vide' })
  key: string;

  @ApiProperty({ description: 'Valeur du parametre' })
  @IsString({ message: 'La valeur doit etre une chaine de caracteres' })
  @IsNotEmpty({ message: 'La valeur ne peut pas etre vide' })
  value: string;
}

export class UpdateSettingsDto {
  @ApiProperty({ description: 'Liste des parametres a mettre a jour', type: [SettingItemDto] })
  @IsArray({ message: 'Les parametres doivent etre un tableau' })
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  settings: SettingItemDto[];
}
