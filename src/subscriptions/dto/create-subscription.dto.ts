import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({ description: 'ID du plan d\'abonnement' })
  @IsString()
  @IsNotEmpty({ message: 'L\'identifiant du plan est requis' })
  planId: string;

  @ApiPropertyOptional({ description: 'Date de debut (ISO 8601), par defaut maintenant' })
  @IsOptional()
  @IsDateString({}, { message: 'La date de debut doit etre au format ISO 8601' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'Renouvellement automatique', default: true })
  @IsOptional()
  @IsBoolean({ message: 'Le champ autoRenew doit etre un booleen' })
  autoRenew?: boolean;
}
