import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClaimDto {
  @ApiProperty({ description: 'ID du patient' })
  @IsString()
  @IsNotEmpty({ message: 'L\'identifiant du patient est requis' })
  patientId: string;

  @ApiPropertyOptional({ description: 'ID de la consultation' })
  @IsOptional()
  @IsString()
  consultationId?: string;

  @ApiProperty({ description: 'Montant de la reclamation' })
  @IsNumber({}, { message: 'Le montant doit etre un nombre' })
  @IsNotEmpty({ message: 'Le montant est requis' })
  amount: number;

  @ApiPropertyOptional({ description: 'Description de la reclamation' })
  @IsOptional()
  @IsString()
  description?: string;
}
