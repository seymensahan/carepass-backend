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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { FieldAgentsService } from './field-agents.service';
import {
  CreateFieldVisitDto,
  UpdateFieldVisitDto,
  CreateOnboardingDto,
  UpdateOnboardingDto,
} from './dto/field-agents.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// =============================================================================
// FIELD AGENT ROUTES — accessed by agents themselves
// =============================================================================

@ApiTags('field-agents')
@Controller('field-agents')
export class FieldAgentsController {
  constructor(private readonly service: FieldAgentsService) {}

  // ── Agent Profile ──
  @Get('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get agent profile' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.service.getAgentProfile(userId);
  }

  // ── Stats ──
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get agent stats (KPIs)' })
  getStats(@CurrentUser('id') userId: string) {
    return this.service.getStats(userId);
  }

  // ── Performance + Ranking ──
  @Get('performance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get agent performance and ranking' })
  getPerformance(@CurrentUser('id') userId: string) {
    return this.service.getPerformance(userId);
  }

  // ── Field Visits ──
  @Get('visits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List field visits' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'outcome', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getVisits(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('outcome') outcome?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getVisits(userId, {
      status,
      outcome,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('visits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a field visit' })
  createVisit(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFieldVisitDto,
  ) {
    return this.service.createVisit(userId, dto);
  }

  @Patch('visits/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a field visit (status, GPS, outcome)' })
  updateVisit(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFieldVisitDto,
  ) {
    return this.service.updateVisit(userId, id, dto);
  }

  // ── Onboardings ──
  @Get('onboardings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List onboardings' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'userRole', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getOnboardings(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('userRole') userRole?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getOnboardings(userId, {
      status,
      userRole,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('onboardings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new onboarding' })
  createOnboarding(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateOnboardingDto,
  ) {
    return this.service.createOnboarding(userId, dto);
  }

  @Patch('onboardings/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update onboarding status/steps' })
  updateOnboarding(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingDto,
  ) {
    return this.service.updateOnboarding(userId, id, dto);
  }

  // ── Assign Voucher ──
  @Post('onboardings/:id/assign-voucher')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('field_agent')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign a voucher from the shared pool to an onboarding' })
  assignVoucher(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.service.assignVoucher(userId, id);
  }

  // ==========================================================================
  // SUPER ADMIN ROUTES — manage field agents
  // ==========================================================================

  @Get('admin/platform-metrics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get platform campaign metrics (super_admin)' })
  getPlatformMetrics() {
    return this.service.getPlatformMetrics();
  }

  @Get('admin/coverage-zones')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get coverage zones for map visualization' })
  getCoverageZones() {
    return this.service.getCoverageZones();
  }

  @Get('admin/agents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all field agents (super_admin)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  listAgents(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.service.listAgents({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      isActive,
    });
  }

  @Get('admin/agents/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get agent details (super_admin)' })
  getAgentDetails(@Param('id') id: string) {
    return this.service.getAgentDetails(id);
  }

  @Post('admin/agents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a field agent account (super_admin)' })
  createAgent(
    @CurrentUser('id') adminId: string,
    @Body() dto: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      password: string;
      zone?: string;
      city?: string;
    },
  ) {
    return this.service.createAgent(adminId, dto);
  }

  @Patch('admin/agents/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle agent active/inactive (super_admin)' })
  toggleStatus(@Param('id') id: string) {
    return this.service.toggleAgentStatus(id);
  }

  /**
   * DELETE /field-agents/admin/agents/:id
   * Permanently delete a field agent and the underlying User account.
   * Super_admin only. Allows the email to be reused for invitations.
   */
  @Delete('admin/agents/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un agent de terrain (super_admin)' })
  @ApiResponse({ status: 200, description: 'Agent supprimé' })
  deleteAgent(@Param('id') id: string) {
    return this.service.deleteAgent(id);
  }
}
