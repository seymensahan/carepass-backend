import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AccessRequestsService } from './access-requests.service';
import { CreateAccessRequestDto } from './dto/create-access-request.dto';
import { AccessRequestFilterDto } from './dto/access-request-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('access-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('access-requests')
export class AccessRequestsController {
  constructor(
    private readonly accessRequestsService: AccessRequestsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les demandes d\'accès (médecin ou patient)' })
  async findAll(
    @CurrentUser() user: any,
    @Query() filters: AccessRequestFilterDto,
  ) {
    return this.accessRequestsService.findAll(user.id, user.role, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une demande d\'accès' })
  async findOne(@Param('id') id: string) {
    return this.accessRequestsService.findOne(id);
  }

  @Post()
  @Roles('doctor')
  @ApiOperation({ summary: 'Créer une demande d\'accès (médecin)' })
  async create(
    @Body() dto: CreateAccessRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.accessRequestsService.create(user.id, dto);
  }

  @Patch(':id/approve')
  @Roles('patient')
  @ApiOperation({ summary: 'Approuver une demande d\'accès (patient)' })
  async approve(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.accessRequestsService.approve(id, user.id);
  }

  @Patch(':id/deny')
  @Roles('patient')
  @ApiOperation({ summary: 'Refuser une demande d\'accès (patient)' })
  async deny(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.accessRequestsService.deny(id, user.id);
  }
}
