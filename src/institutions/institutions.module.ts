import { Module } from '@nestjs/common';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';
import { InvitationsService } from './invitations.service';
import { AppwriteService } from '../common/services/appwrite.service';

@Module({
  controllers: [InstitutionsController],
  providers: [InstitutionsService, InvitationsService, AppwriteService],
  exports: [InstitutionsService, InvitationsService],
})
export class InstitutionsModule {}
