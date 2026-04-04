import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { VouchersService } from './vouchers.service';
import { GenerateVouchersDto, ValidateVoucherDto, RedeemVoucherDto } from './dto/generate-vouchers.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('vouchers')
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  // -------------------------------------------------------------------------
  // POST /vouchers/generate — Super-admin: generate a batch of vouchers
  // -------------------------------------------------------------------------
  @Post('generate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generer un lot de vouchers (super_admin)' })
  @ApiResponse({ status: 201, description: 'Vouchers generes' })
  generateBatch(
    @CurrentUser('id') userId: string,
    @Body() dto: GenerateVouchersDto,
  ) {
    return this.vouchersService.generateBatch(
      userId,
      dto.type,
      dto.count,
      dto.durationMonths,
      dto.discountPercent,
      dto.expiresAt,
    );
  }

  // -------------------------------------------------------------------------
  // GET /vouchers/stats — Super-admin: voucher statistics
  // -------------------------------------------------------------------------
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques des vouchers (super_admin)' })
  @ApiResponse({ status: 200, description: 'Statistiques' })
  getStats() {
    return this.vouchersService.getStats();
  }

  // -------------------------------------------------------------------------
  // GET /vouchers/export — Super-admin: export vouchers as CSV
  // -------------------------------------------------------------------------
  @Get('export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exporter les vouchers en CSV (super_admin)' })
  @ApiResponse({ status: 200, description: 'Fichier CSV' })
  async exportVouchers(
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('batchId') batchId?: string,
    @Query('isUsed') isUsed?: string,
  ) {
    const csv = await this.vouchersService.exportVouchers({ type, batchId, isUsed });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=vouchers.csv');
    res.send(csv);
  }

  // -------------------------------------------------------------------------
  // GET /vouchers — Super-admin: list vouchers with filters
  // -------------------------------------------------------------------------
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les vouchers avec filtres (super_admin)' })
  @ApiResponse({ status: 200, description: 'Liste paginee de vouchers' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'isUsed', required: false })
  @ApiQuery({ name: 'batchId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getVouchers(
    @Query('type') type?: string,
    @Query('isUsed') isUsed?: string,
    @Query('batchId') batchId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.vouchersService.getVouchers({
      type,
      isUsed,
      batchId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // POST /vouchers/validate — Authenticated: validate a voucher code
  // -------------------------------------------------------------------------
  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Valider un code voucher' })
  @ApiResponse({ status: 200, description: 'Voucher valide' })
  validateVoucher(
    @CurrentUser('id') userId: string,
    @Body() dto: ValidateVoucherDto,
  ) {
    return this.vouchersService.validateVoucher(dto.code, userId);
  }

  // -------------------------------------------------------------------------
  // POST /vouchers/redeem — Authenticated: redeem a voucher
  // -------------------------------------------------------------------------
  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Utiliser un voucher (creer abonnement gratuit)' })
  @ApiResponse({ status: 200, description: 'Voucher utilise, abonnement cree' })
  redeemVoucher(
    @CurrentUser('id') userId: string,
    @Body() dto: RedeemVoucherDto,
  ) {
    return this.vouchersService.redeemVoucher(dto.code, userId);
  }

  // -------------------------------------------------------------------------
  // DELETE /vouchers/:id — Super-admin: delete unused voucher
  // -------------------------------------------------------------------------
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Supprimer un voucher non utilise (super_admin)' })
  @ApiParam({ name: 'id', description: 'ID du voucher' })
  @ApiResponse({ status: 200, description: 'Voucher supprime' })
  deleteVoucher(@Param('id') id: string) {
    return this.vouchersService.deleteVoucher(id);
  }
}
