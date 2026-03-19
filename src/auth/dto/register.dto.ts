import { IsEmail, IsString, MinLength, IsEnum, IsOptional, IsIn, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, InstitutionType } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@carepass.cm' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'motdepasse', minLength: 4 })
  @IsString()
  @MinLength(4, { message: 'Le mot de passe doit contenir au moins 4 caractères' })
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

  // ─── Institution fields (used when role = institution_admin) ───

  @ApiPropertyOptional({ example: 'Clinique de la Cathédrale' })
  @IsOptional()
  @IsString()
  institutionName?: string;

  @ApiPropertyOptional({ enum: InstitutionType })
  @IsOptional()
  @IsEnum(InstitutionType)
  institutionType?: InstitutionType;

  @ApiPropertyOptional({ example: '123 Rue de la Liberté' })
  @IsOptional()
  @IsString()
  institutionAddress?: string;

  @ApiPropertyOptional({ example: 'Douala' })
  @IsOptional()
  @IsString()
  institutionCity?: string;

  @ApiPropertyOptional({ example: '+237 233 000 000' })
  @IsOptional()
  @IsString()
  institutionPhone?: string;

  @ApiPropertyOptional({ example: 'contact@clinique.cm' })
  @IsOptional()
  @IsString()
  institutionEmail?: string;

  @ApiPropertyOptional({ example: 'https://clinique.cm' })
  @IsOptional()
  @IsString()
  institutionWebsite?: string;
}
