import { Module } from '@nestjs/common';
import { MedicalConditionsController } from './medical-conditions.controller';
import { MedicalConditionsService } from './medical-conditions.service';

@Module({
  controllers: [MedicalConditionsController],
  providers: [MedicalConditionsService],
  exports: [MedicalConditionsService],
})
export class MedicalConditionsModule {}
