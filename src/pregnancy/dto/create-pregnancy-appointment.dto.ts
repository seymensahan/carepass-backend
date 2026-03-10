import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePregnancyAppointmentDto {
  @ApiProperty({ example: 'Échographie T1', description: 'Titre du rendez-vous' })
  @IsString()
  title: string;

  @ApiProperty({ example: '2026-04-15', description: 'Date du rendez-vous' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 'echographie', description: 'Type (echographie, consultation, analyse, autre)' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
