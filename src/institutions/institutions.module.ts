import { Module } from '@nestjs/common';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';
import { InvitationsService } from './invitations.service';
import { AppwriteService } from '../common/services/appwrite.service';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [EmailModule, NotificationsModule],
  controllers: [InstitutionsController],
  providers: [InstitutionsService, InvitationsService, AppwriteService],
  exports: [InstitutionsService, InvitationsService],
})
export class InstitutionsModule {}
