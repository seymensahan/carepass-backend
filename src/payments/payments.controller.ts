import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /payments/initiate
   * Initiate a mobile money payment for a subscription (authenticated user).
   */
  @Post('initiate')
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initier un paiement Mobile Money (Pawapay)' })
  @ApiResponse({ status: 201, description: 'Paiement initié' })
  initiatePayment(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(userId, dto);
  }

  /**
   * POST /payments/initiate-registration
   * PUBLIC: Initiate payment for a new registration (no account created yet).
   * The account is created only when PawaPay webhook confirms the payment.
   */
  @Post('initiate-registration')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initier un paiement pour inscription (public, pas de compte créé)' })
  @ApiResponse({ status: 201, description: 'Session de paiement créée' })
  initiateRegistrationPayment(@Body() body: any) {
    return this.paymentsService.initiateRegistrationPayment(body);
  }

  /**
   * GET /payments/registration/:depositId/poll
   * PUBLIC: poll the registration payment status. Used by the mobile/web app
   * after payment initiation to detect completion when the Pawapay webhook
   * cannot reach our server (typically in dev/local environments).
   *
   * Returns { status: 'pending' | 'completed' | 'failed', credentials? }
   * On 'completed', credentials = { accessToken, refreshToken, user } so the
   * client can auto-login and redirect straight to the dashboard.
   */
  @Get('registration/:depositId/poll')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Poll le statut d\'un paiement d\'inscription (public)' })
  pollRegistration(@Param('depositId') depositId: string) {
    return this.paymentsService.pollRegistrationStatus(depositId);
  }

  /**
   * POST /payments/webhook
   * Pawapay webhook callback (public route).
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook Pawapay (callback de paiement)' })
  @ApiResponse({ status: 200, description: 'Webhook traité' })
  handleWebhook(@Body() body: any) {
    return this.paymentsService.handleWebhook(body);
  }

  /**
   * GET /payments/history
   * Get payment history for the authenticated user.
   */
  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Historique des paiements' })
  @ApiResponse({ status: 200, description: 'Liste des paiements' })
  getHistory(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentsService.getPaymentHistory(userId, Number(page) || 1, Number(limit) || 20);
  }

  /**
   * GET /payments/:id
   * Get a specific payment status.
   */
  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statut de l\'abonnement' })
  @ApiResponse({ status: 200, description: 'Détails de l\'abonnement' })
  getSubscription(@CurrentUser('id') userId: string) {
    return this.paymentsService.getSubscriptionStatus(userId);
  }

  @Get(':id/poll')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifier le statut d\'un paiement (polling)' })
  @ApiParam({ name: 'id', description: 'ID du paiement' })
  pollPayment(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.pollPaymentStatus(id, userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statut d\'un paiement' })
  @ApiParam({ name: 'id', description: 'ID du paiement' })
  @ApiResponse({ status: 200, description: 'Détails du paiement' })
  getPaymentStatus(@Param('id') id: string) {
    return this.paymentsService.getPaymentStatus(id);
  }
}
