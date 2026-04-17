import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

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
}
