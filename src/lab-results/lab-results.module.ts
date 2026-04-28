import { Module } from '@nestjs/common';
import { LabResultsController } from './lab-results.controller';
import { LabResultsService } from './lab-results.service';
import { EmailModule } from '../email/email.module';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [EmailModule, NotificationsModule],
  controllers: [LabResultsController],
  providers: [LabResultsService, CloudinaryService],
  exports: [LabResultsService],
})
export class LabResultsModule {}
