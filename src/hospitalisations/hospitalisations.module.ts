import { Module } from '@nestjs/common';
import { HospitalisationsController } from './hospitalisations.controller';
import { HospitalisationsService } from './hospitalisations.service';

@Module({
  controllers: [HospitalisationsController],
  providers: [HospitalisationsService],
  exports: [HospitalisationsService],
})
export class HospitalisationsModule {}
