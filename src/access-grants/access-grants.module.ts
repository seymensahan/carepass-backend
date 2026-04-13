import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { AccessGrantsController } from './access-grants.controller';
import { AccessGrantsService } from './access-grants.service';

@Module({
  controllers: [AccessGrantsController],
  providers: [AccessGrantsService],
  exports: [AccessGrantsService],
})
export class AccessGrantsModule implements OnModuleInit {
  private readonly logger = new Logger(AccessGrantsModule.name);

  constructor(private readonly service: AccessGrantsService) {}

  onModuleInit() {
    // Revoke expired grants on startup
    this.service.revokeExpiredGrants().catch((err) => {
      this.logger.error('Startup: failed to revoke expired grants', err);
    });

    // Then every 24 hours
    setInterval(() => {
      this.service.revokeExpiredGrants().catch(() => {});
    }, 86400000);
  }
}
