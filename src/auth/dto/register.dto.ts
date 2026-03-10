import { IsEmail, IsString, MinLength, Matches, IsEnum, IsOptional, IsIn, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@carepass.cm' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Le mot de passe doit contenir au moins 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial',
  })
  password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'Alain' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Nkoulou' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: '+237 699 000 001' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'M', enum: ['M', 'F'] })
  @IsOptional()
  @IsIn(['M', 'F'], { message: 'Le genre doit être M ou F' })
  gender?: string;

  @ApiPropertyOptional({ example: '1990-03-15' })
  @IsOptional()
  @IsDateString({}, { message: 'Format de date invalide (AAAA-MM-JJ)' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'O+' })
  @IsOptional()
  @IsString()
  bloodGroup?: string;
}
