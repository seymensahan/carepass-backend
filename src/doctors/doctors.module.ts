import { Module } from '@nestjs/common';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { DoctorSyncService } from './doctor-sync.service';
import { InstitutionsModule } from '../institutions/institutions.module';
import { CloudinaryService } from '../common/services/cloudinary.service';

@Module({
  imports: [InstitutionsModule],
  controllers: [DoctorsController],
  providers: [DoctorsService, DoctorSyncService, CloudinaryService],
  exports: [DoctorsService, DoctorSyncService],
})
export class DoctorsModule {}
