import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly subscriptionRenewalService: SubscriptionRenewalService,
  ) {}

  /**
   * GET /wallet
   * Get wallet balance (doctor only)
   */
  @Get()
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir le solde du portefeuille' })
  @ApiResponse({ status: 200, description: 'Solde du portefeuille' })
  getBalance(@CurrentUser('id') userId: string) {
    return this.walletService.getBalance(userId);
  }

  /**
   * GET /wallet/transactions
   * Get transaction history (doctor only)
   */
  @Get('transactions')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Historique des transactions du portefeuille' })
  @ApiResponse({ status: 200, description: 'Liste des transactions' })
  getTransactions(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.walletService.getTransactions(
      userId,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  /**
   * POST /wallet/withdraw
   * Request a withdrawal (doctor only)
   */
  @Post('withdraw')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Demander un retrait Mobile Money' })
  @ApiResponse({ status: 200, description: 'Retrait initié' })
  requestWithdrawal(
    @CurrentUser('id') userId: string,
    @Body() body: { amount: number; phoneNumber: string },
  ) {
    return this.walletService.requestWithdrawal(
      userId,
      body.amount,
      body.phoneNumber,
    );
  }

  /**
   * POST /wallet/admin/trigger-renewal
   * Manually trigger the subscription renewal job (super admin only).
   * Useful for testing; in production this runs daily at 02:00 via cron.
   */
  @Post('admin/trigger-renewal')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Déclencher manuellement le renouvellement (super admin)',
  })
  @ApiResponse({ status: 200, description: 'Renouvellement traité' })
  async triggerRenewal() {
    // Use the logged path so the manual run shows up in the cron history.
    // runWithLogging returns undefined if the cron crashed (DB unreachable etc.)
    const result = await this.subscriptionRenewalService.triggerManually();
    if (!result) {
      return {
        success: false,
        message: 'Le cron a échoué (voir les logs serveur).',
        data: null,
      };
    }
    return {
      success: true,
      message: `${result.renewed} abonnement(s) renouvelé(s), ${result.failed} échec(s) sur ${result.processed} traité(s)`,
      data: result,
    };
  }

  /**
   * POST /wallet/admin/force-renew/:userId
   * Force the renewal of a specific user's subscription (super admin testing).
   * Bypasses the expiry-date check — useful to verify the wallet-debit flow
   * without waiting for natural expiry.
   */
  @Post('admin/force-renew/:userId')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Forcer le renouvellement d\'un utilisateur spécifique (super admin)',
  })
  async forceRenewUser(@Param('userId') userId: string) {
    const result = await this.subscriptionRenewalService.forceRenewSubscription(userId);
    if (!result) {
      return {
        success: false,
        message: 'Le cron a échoué (voir les logs serveur).',
        data: null,
      };
    }
    const detail = result.details as Record<string, any> | undefined;
    if (detail?.error) {
      return { success: false, message: detail.error, data: result };
    }
    return {
      success: true,
      message:
        detail?.renewed === 1
          ? `Abonnement de ${detail.email} renouvelé. ${detail.role === 'doctor' ? 'Wallet débité.' : ''}`
          : detail?.failed === 1
            ? `Échec du renouvellement de ${detail.email} (solde insuffisant)`
            : detail?.expired === 1
              ? `Abonnement de ${detail.email} marqué expiré`
              : 'Aucune action effectuée',
      data: result,
    };
  }
}
