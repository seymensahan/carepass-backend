import { Module } from '@nestjs/common';
import { FieldAgentsController } from './field-agents.controller';
import { FieldAgentsService } from './field-agents.service';

@Module({
  controllers: [FieldAgentsController],
  providers: [FieldAgentsService],
  exports: [FieldAgentsService],
})
export class FieldAgentsModule {}
