import { IsString, IsOptional, IsIn, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ example: 'AA' })
  @IsOptional()
  @IsString()
  genotype?: string;
}
