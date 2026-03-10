import { Module } from '@nestjs/common';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { DoctorSyncService } from './doctor-sync.service';

@Module({
  controllers: [DoctorsController],
  providers: [DoctorsService, DoctorSyncService],
  exports: [DoctorsService, DoctorSyncService],
})
export class DoctorsModule {}
