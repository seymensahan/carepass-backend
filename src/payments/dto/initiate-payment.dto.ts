import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'plan-uuid-here', description: 'ID du plan d\'abonnement' })
  @IsString()
  planId: string;

  @ApiProperty({ example: 237670000000, description: 'Numéro de téléphone pour le paiement mobile' })
  @IsString()
  phoneNumber: string;

  @ApiPropertyOptional({ example: 'monthly', description: 'Période: monthly ou yearly' })
  @IsOptional()
  @IsString()
  period?: string;
}
