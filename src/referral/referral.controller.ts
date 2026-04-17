import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ReferralService } from './referral.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('referral')
@Controller('referral')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * POST /referral/generate
   * Generate or get my referral code (doctor only)
   */
  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Générer un code de parrainage (médecin)' })
  @ApiResponse({ status: 201, description: 'Code de parrainage généré' })
  generateCode(@CurrentUser('id') userId: string) {
    return this.referralService.generateCode(userId);
  }

  /**
   * GET /referral/my-code
   * Get my referral code + stats (doctor only)
   */
  @Get('my-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mon code de parrainage et statistiques' })
  @ApiResponse({ status: 200, description: 'Code de parrainage' })
  getMyCode(@CurrentUser('id') userId: string) {
    return this.referralService.getMyCode(userId);
  }

  /**
   * GET /referral/my-referrals
   * List patients I referred (doctor only)
   */
  @Get('my-referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liste des patients parrainés' })
  @ApiResponse({ status: 200, description: 'Liste des parrainages' })
  getMyReferrals(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.referralService.getMyReferrals(
      userId,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  /**
   * GET /referral/validate/:code
   * Validate a referral code (public, used during patient registration)
   */
  @Get('validate/:code')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valider un code de parrainage (public)' })
  @ApiParam({ name: 'code', description: 'Code de parrainage à valider' })
  @ApiResponse({ status: 200, description: 'Résultat de la validation' })
  validateCode(@Param('code') code: string) {
    return this.referralService.validateCode(code);
  }
}
