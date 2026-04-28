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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LabOrdersService } from './lab-orders.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('lab-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lab-orders')
export class LabOrdersController {
  constructor(private readonly service: LabOrdersService) {}

  @Get('stats')
  @Roles('lab')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Statistiques labo (pending, in progress, completed)' })
  getStats(@CurrentUser('id') userId: string) {
    return this.service.getLabStats(userId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lister les ordres de laboratoire (filtré par rôle)' })
  findAll(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(user, {
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Détail d\'un ordre' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Post(':id/pick-up')
  @Roles('lab')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prendre en charge un ordre (lab)' })
  pickUp(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.pickUp(id, userId);
  }

  @Post(':id/cancel')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler un ordre (médecin prescripteur)' })
  cancel(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.cancel(id, userId);
  }
}
