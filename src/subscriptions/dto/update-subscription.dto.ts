import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ description: 'Renouvellement automatique' })
  @IsOptional()
  @IsBoolean({ message: 'Le champ autoRenew doit etre un booleen' })
  autoRenew?: boolean;
}
