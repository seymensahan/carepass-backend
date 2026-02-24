import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDoctorDto {
  @ApiProperty({ example: 'Cardiologie', description: 'Specialite medicale' })
  @IsString()
  specialty: string;

  @ApiProperty({ example: 'MD-CM-2024-00123', description: 'Numero de licence medicale' })
  @IsString()
  licenseNumber: string;

  @ApiPropertyOptional({ description: 'ID de l\'institution rattachee' })
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @ApiPropertyOptional({ example: 'Cardiologue avec 10 ans d\'experience...', description: 'Biographie' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'Yaounde', description: 'Ville' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Centre', description: 'Region' })
  @IsOptional()
  @IsString()
  region?: string;
}
