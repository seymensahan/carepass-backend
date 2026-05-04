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
import { InstitutionReferralService } from './institution-referral.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('institution-referral')
@Controller('institution-referral')
export class InstitutionReferralController {
  constructor(private readonly service: InstitutionReferralService) {}

  /**
   * POST /institution-referral/generate
   * Generate (or fetch) the institution's referral code. Admin only.
   */
  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institution_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Générer le code de parrainage de l\'institution' })
  generateCode(@CurrentUser('id') userId: string) {
    return this.service.generateCode(userId);
  }

  /**
   * GET /institution-referral/my-code
   * Get the institution code visible to any member (admin, doctor, nurse).
   */
  @Get('my-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institution_admin', 'doctor', 'nurse')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Code de parrainage de mon institution (accessible par admin/médecin/infirmier)',
  })
  getCodeForMember(@CurrentUser('id') userId: string) {
    return this.service.getCodeForMember(userId);
  }

  /**
   * GET /institution-referral/my-referrals
   * List patients referred via this institution (admin only — they see the
   * earnings dashboard).
   */
  @Get('my-referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('institution_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Patients parrainés par mon institution' })
  getInstitutionReferrals(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getInstitutionReferrals(
      userId,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  /**
   * GET /institution-referral/validate/:code
   * Public — used during patient registration to confirm the code is valid
   * and display the institution name.
   */
  @Get('validate/:code')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valider un code de parrainage institution (public)' })
  @ApiParam({ name: 'code', description: 'Code à valider' })
  validateCode(@Param('code') code: string) {
    return this.service.validateCode(code);
  }
}
