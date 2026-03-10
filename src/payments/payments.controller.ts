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
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /payments/initiate
   * Initiate a mobile money payment for a subscription.
   */
  @Post('initiate')
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
   * POST /payments/webhook
   * Pawapay webhook callback (public route).
   */
  @Post('webhook')
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
