import { Module } from '@nestjs/common';
import { HospitalisationsController } from './hospitalisations.controller';
import { HospitalisationsService } from './hospitalisations.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [HospitalisationsController],
  providers: [HospitalisationsService],
  exports: [HospitalisationsService],
})
export class HospitalisationsModule {}
