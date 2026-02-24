import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // ===================== SUBSCRIPTIONS =====================

  /**
   * GET /subscriptions
   * Liste paginee des abonnements (super_admin voit tout, autres voient les leurs).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les abonnements (role: super_admin voit tout, autres voient les leurs)' })
  @ApiResponse({ status: 200, description: 'Liste des abonnements' })
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.subscriptionsService.findAll(user, Number(page) || 1, Number(limit) || 20);
  }

  // ===================== PLANS (avant /:id pour eviter les conflits de route) =====================

  /**
   * GET /subscriptions/plans
   * Liste de tous les plans actifs.
   */
  @Get('plans')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les plans d\'abonnement disponibles' })
  @ApiResponse({ status: 200, description: 'Liste des plans' })
  findAllPlans() {
    return this.subscriptionsService.findAllPlans();
  }

  /**
   * GET /subscriptions/plans/:id
   * Obtenir un plan par ID.
   */
  @Get('plans/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir les details d\'un plan d\'abonnement' })
  @ApiParam({ name: 'id', description: 'ID du plan' })
  @ApiResponse({ status: 200, description: 'Details du plan' })
  @ApiResponse({ status: 404, description: 'Plan non trouve' })
  findOnePlan(@Param('id') id: string) {
    return this.subscriptionsService.findOnePlan(id);
  }

  /**
   * POST /subscriptions/plans
   * Creer un plan. Reserve au super_admin.
   */
  @Post('plans')
  @Roles('super_admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer un plan d\'abonnement (role: super_admin)' })
  @ApiResponse({ status: 201, description: 'Plan cree avec succes' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.subscriptionsService.createPlan(dto);
  }

  /**
   * PATCH /subscriptions/plans/:id
   * Mettre a jour un plan. Reserve au super_admin.
   */
  @Patch('plans/:id')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre a jour un plan d\'abonnement (role: super_admin)' })
  @ApiParam({ name: 'id', description: 'ID du plan' })
  @ApiResponse({ status: 200, description: 'Plan mis a jour' })
  @ApiResponse({ status: 403, description: 'Acces refuse' })
  @ApiResponse({ status: 404, description: 'Plan non trouve' })
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.subscriptionsService.updatePlan(id, dto);
  }

  // ===================== SUBSCRIPTIONS (parametriques) =====================

  /**
   * GET /subscriptions/:id
   * Obtenir un abonnement par ID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtenir un abonnement par ID' })
  @ApiParam({ name: 'id', description: 'ID de l\'abonnement' })
  @ApiResponse({ status: 200, description: 'Details de l\'abonnement' })
  @ApiResponse({ status: 404, description: 'Abonnement non trouve' })
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findOne(id);
  }

  /**
   * POST /subscriptions
   * Creer un abonnement.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer un abonnement' })
  @ApiResponse({ status: 201, description: 'Abonnement cree avec succes' })
  @ApiResponse({ status: 400, description: 'Plan inactif ou abonnement actif existant' })
  @ApiResponse({ status: 404, description: 'Plan non trouve' })
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: any) {
    // TODO: Integrer Pawapay pour le traitement des paiements
    return this.subscriptionsService.create(user.id, dto);
  }

  /**
   * PATCH /subscriptions/:id
   * Mettre a jour un abonnement.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre a jour un abonnement' })
  @ApiParam({ name: 'id', description: 'ID de l\'abonnement' })
  @ApiResponse({ status: 200, description: 'Abonnement mis a jour' })
  @ApiResponse({ status: 404, description: 'Abonnement non trouve' })
  update(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.subscriptionsService.update(id, dto);
  }

  /**
   * DELETE /subscriptions/:id/cancel
   * Annuler un abonnement.
   */
  @Delete(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler un abonnement' })
  @ApiParam({ name: 'id', description: 'ID de l\'abonnement' })
  @ApiResponse({ status: 200, description: 'Abonnement annule' })
  @ApiResponse({ status: 400, description: 'Abonnement deja annule' })
  @ApiResponse({ status: 404, description: 'Abonnement non trouve' })
  cancel(@Param('id') id: string) {
    return this.subscriptionsService.cancel(id);
  }
}
