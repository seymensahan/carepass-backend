import { IsString, IsEnum, IsOptional, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCarePlanItemDto {
  @ApiProperty({ enum: ['medication', 'vital_check', 'care_task'] })
  @IsEnum(['medication', 'vital_check', 'care_task'])
  type: 'medication' | 'vital_check' | 'care_task';

  @ApiProperty({ example: 'Paracétamol 1g' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Administrer par voie orale avec un verre d\'eau' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Paracétamol' })
  @IsOptional()
  @IsString()
  medication?: string;

  @ApiPropertyOptional({ example: '1g' })
  @IsOptional()
  @IsString()
  dosage?: string;

  @ApiPropertyOptional({ enum: ['PO', 'IV', 'IM', 'SC', 'inhalation', 'topical'] })
  @IsOptional()
  @IsEnum(['PO', 'IV', 'IM', 'SC', 'inhalation', 'topical'])
  route?: string;

  @ApiPropertyOptional({ example: '3x/jour' })
  @IsOptional()
  @IsString()
  frequency?: string;

  @ApiPropertyOptional({ example: '08:00,14:00,20:00' })
  @IsOptional()
  @IsString()
  scheduledTimes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
