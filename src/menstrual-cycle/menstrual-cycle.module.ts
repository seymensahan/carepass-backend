import { Module } from '@nestjs/common';
import { MenstrualCycleController } from './menstrual-cycle.controller';
import { MenstrualCycleService } from './menstrual-cycle.service';

@Module({
  controllers: [MenstrualCycleController],
  providers: [MenstrualCycleService],
  exports: [MenstrualCycleService],
})
export class MenstrualCycleModule {}
