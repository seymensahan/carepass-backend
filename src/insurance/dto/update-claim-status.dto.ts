import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateClaimStatusDto {
  @ApiProperty({
    description: 'Nouveau statut de la reclamation',
    enum: ['approved', 'rejected', 'paid'],
  })
  @IsEnum(['approved', 'rejected', 'paid'], {
    message: 'Le statut doit etre approved, rejected ou paid',
  })
  @IsNotEmpty({ message: 'Le statut est requis' })
  status: 'approved' | 'rejected' | 'paid';
}
