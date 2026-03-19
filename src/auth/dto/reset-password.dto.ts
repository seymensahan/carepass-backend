import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(4, { message: 'Le mot de passe doit contenir au moins 4 caractères' })
  newPassword: string;
}
