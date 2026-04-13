import { Module, Global, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailProcessor } from './email.processor';

const redisEnabled = !!process.env.REDIS_HOST;

@Global()
@Module({
  imports: redisEnabled ? [BullModule.registerQueue({ name: 'emails' })] : [],
  providers: redisEnabled ? [EmailService, EmailProcessor] : [EmailService],
  exports: [EmailService],
})
export class EmailModule {
  constructor() {
    if (!redisEnabled) {
      new Logger(EmailModule.name).warn(
        'REDIS_HOST not set — email queue disabled, sending emails synchronously',
      );
    }
  }
}
