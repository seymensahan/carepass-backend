import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { AccessGrantsService } from './access-grants.service';
import { CreateAccessGrantDto } from './dto/create-access-grant.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('access-grants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('access-grants')
export class AccessGrantsController {
  constructor(
    private readonly accessGrantsService: AccessGrantsService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * Resolve the patient profile ID from the authenticated user.
   */
  private async getPatientId(userId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });
    if (!patient) {
      throw new NotFoundException('Profil patient non trouvé');
    }
    return patient.id;
  }

  @Get('doctors')
  @Roles('patient')
  @ApiOperation({ summary: 'Lister les médecins ayant accès au dossier du patient' })
  async findDoctors(@CurrentUser() user: any) {
    const patientId = await this.getPatientId(user.id);
    return this.accessGrantsService.findDoctors(patientId);
  }

  @Get('patients')
  @Roles('doctor')
  @ApiOperation({ summary: 'Lister les patients auxquels le médecin a accès' })
  async findPatients(@CurrentUser() user: any) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) throw new NotFoundException('Profil médecin non trouvé');
    return this.accessGrantsService.findPatients(doctor.id);
  }

  @Get()
  @Roles('patient')
  @ApiOperation({ summary: 'Lister les accès actifs du patient' })
  async findAll(@CurrentUser() user: any) {
    const patientId = await this.getPatientId(user.id);
    return this.accessGrantsService.findAll(patientId);
  }

  @Post()
  @Roles('patient')
  @ApiOperation({ summary: 'Accorder un accès à un médecin' })
  async create(
    @Body() dto: CreateAccessGrantDto,
    @CurrentUser() user: any,
  ) {
    const patientId = await this.getPatientId(user.id);
    return this.accessGrantsService.create(patientId, dto);
  }

  @Delete(':id')
  @Roles('patient')
  @ApiOperation({ summary: 'Révoquer un accès' })
  async revoke(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const patientId = await this.getPatientId(user.id);
    return this.accessGrantsService.revoke(id, patientId);
  }
}
