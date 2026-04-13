import { Module } from '@nestjs/common';
import { AccessRequestsController } from './access-requests.controller';
import { AccessRequestsService } from './access-requests.service';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [EmailModule, NotificationsModule],
  controllers: [AccessRequestsController],
  providers: [AccessRequestsService],
  exports: [AccessRequestsService],
})
export class AccessRequestsModule {}
