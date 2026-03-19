import { Module } from '@nestjs/common';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';
import { AppwriteService } from '../common/services/appwrite.service';

@Module({
  controllers: [InstitutionsController],
  providers: [InstitutionsService, AppwriteService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
