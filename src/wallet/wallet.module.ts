import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [WalletController],
  providers: [WalletService, SubscriptionRenewalService],
  exports: [WalletService, SubscriptionRenewalService],
})
export class WalletModule {}
