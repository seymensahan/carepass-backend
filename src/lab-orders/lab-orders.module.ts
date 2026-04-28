import { Module } from '@nestjs/common';
import { LabOrdersController } from './lab-orders.controller';
import { LabOrdersService } from './lab-orders.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService],
  exports: [LabOrdersService],
})
export class LabOrdersModule {}
