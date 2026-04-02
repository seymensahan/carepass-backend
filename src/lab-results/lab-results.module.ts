import { Module } from '@nestjs/common';
import { LabResultsController } from './lab-results.controller';
import { LabResultsService } from './lab-results.service';
import { EmailModule } from '../email/email.module';
import { AppwriteService } from '../common/services/appwrite.service';

@Module({
  imports: [EmailModule],
  controllers: [LabResultsController],
  providers: [LabResultsService, AppwriteService],
  exports: [LabResultsService],
})
export class LabResultsModule {}
