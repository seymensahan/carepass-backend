import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionsModule.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  onModuleInit() {
    // Run expiry check on startup
    this.subscriptionsService.expireSubscriptions().then((result) => {
      if (result.expired > 0) {
        this.logger.log(`Startup: ${result.expired} abonnement(s) expirés`);
      }
    });

    // Run expiry check every 24 hours (86400000 ms)
    setInterval(() => {
      this.subscriptionsService.expireSubscriptions().then((result) => {
        if (result.expired > 0) {
          this.logger.log(`Cron: ${result.expired} abonnement(s) expirés`);
        }
      });
    }, 86400000);
  }
}
