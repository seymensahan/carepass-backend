import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum AppointmentStatusUpdate {
  confirmed = 'confirmed',
  cancelled = 'cancelled',
  completed = 'completed',
}

export class UpdateStatusDto {
  @ApiProperty({
    description: 'Nouveau statut du rendez-vous',
    enum: AppointmentStatusUpdate,
  })
  @IsNotEmpty({ message: 'Le statut est requis' })
  @IsEnum(AppointmentStatusUpdate, {
    message: 'Le statut doit être confirmed, cancelled ou completed',
  })
  status: AppointmentStatusUpdate;
}
