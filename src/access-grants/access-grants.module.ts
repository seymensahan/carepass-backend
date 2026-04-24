import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { AccessGrantsController } from './access-grants.controller';
import { AccessGrantsService } from './access-grants.service';
import { AccessGrantsCleanupService } from './access-grants-cleanup.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [AccessGrantsController],
  providers: [AccessGrantsService, AccessGrantsCleanupService],
  exports: [AccessGrantsService, AccessGrantsCleanupService],
})
export class AccessGrantsModule implements OnModuleInit {
  private readonly logger = new Logger(AccessGrantsModule.name);

  constructor(private readonly cleanupService: AccessGrantsCleanupService) {}

  onModuleInit() {
    // Revoke expired grants on startup so the system catches up after any
    // downtime. The hourly @Cron in AccessGrantsCleanupService handles
    // ongoing cleanup; the legacy 24h setInterval was removed in favor of
    // the proper scheduled cron with logging.
    this.cleanupService.processExpiredGrants().catch((err) => {
      this.logger.error('Startup: failed to revoke expired grants', err);
    });
  }
}
