import { IsDateString, IsOptional, IsString, IsInt, IsEnum, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FlowIntensity } from '@prisma/client';

export class UpdateCycleDto {
  @ApiPropertyOptional({ example: '2026-03-01', description: 'Date de début des règles' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-03-06', description: 'Date de fin des règles' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 28, description: 'Durée du cycle en jours' })
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(45)
  cycleLength?: number;

  @ApiPropertyOptional({ example: 5, description: 'Durée des règles en jours' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  periodLength?: number;

  @ApiPropertyOptional({ enum: FlowIntensity, description: 'Intensité du flux' })
  @IsOptional()
  @IsEnum(FlowIntensity)
  flow?: FlowIntensity;

  @ApiPropertyOptional({ description: 'Symptômes (JSON)' })
  @IsOptional()
  symptoms?: any;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
