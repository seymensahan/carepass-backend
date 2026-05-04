import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { DependentMajorityService } from './dependent-majority.service';

@Module({
  controllers: [PatientsController],
  providers: [PatientsService, DependentMajorityService],
  exports: [PatientsService, DependentMajorityService],
})
export class PatientsModule {}
