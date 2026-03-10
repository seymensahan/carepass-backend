import { Module } from '@nestjs/common';
import { PregnancyController } from './pregnancy.controller';
import { PregnancyService } from './pregnancy.service';

@Module({
  controllers: [PregnancyController],
  providers: [PregnancyService],
  exports: [PregnancyService],
})
export class PregnancyModule {}
