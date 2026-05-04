import { Module } from '@nestjs/common';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';
import { InstitutionReferralController } from './institution-referral.controller';
import { InstitutionReferralService } from './institution-referral.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [WalletModule],
  controllers: [ReferralController, InstitutionReferralController],
  providers: [ReferralService, InstitutionReferralService],
  exports: [ReferralService, InstitutionReferralService],
})
export class ReferralModule {}
