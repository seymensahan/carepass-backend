import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HospitalisationsService } from './hospitalisations.service';
import { CreateHospitalisationDto } from './dto/create-hospitalisation.dto';
import { UpdateHospitalisationDto } from './dto/update-hospitalisation.dto';
import { AddVitalDto } from './dto/add-vital.dto';
import { AddMedicationDto } from './dto/add-medication.dto';
import { AddEvolutionNoteDto } from './dto/add-evolution-note.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('hospitalisations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hospitalisations')
export class HospitalisationsController {
  constructor(private readonly service: HospitalisationsService) {}

  @Post()
  @Roles('doctor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Créer une hospitalisation' })
  create(@Body() dto: CreateHospitalisationDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles('doctor')
  @ApiOperation({ summary: 'Lister toutes les hospitalisations du médecin' })
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Get('active')
  @Roles('doctor')
  @ApiOperation({ summary: 'Hospitalisations en cours' })
  findActive(@CurrentUser() user: any) {
    return this.service.findActive(user);
  }

  @Get('stats')
  @Roles('doctor')
  @ApiOperation({ summary: 'Statistiques des hospitalisations' })
  getStats(@CurrentUser() user: any) {
    return this.service.getStats(user);
  }

  @Get(':id')
  @Roles('doctor')
  @ApiOperation({ summary: 'Détail d\'une hospitalisation' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Patch(':id')
  @Roles('doctor')
  @ApiOperation({ summary: 'Modifier une hospitalisation' })
  update(@Param('id') id: string, @Body() dto: UpdateHospitalisationDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/discharge')
  @Roles('doctor')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sortie du patient' })
  discharge(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.discharge(id, user);
  }

  @Post(':id/vitals')
  @Roles('doctor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter des constantes vitales' })
  addVital(@Param('id') id: string, @Body() dto: AddVitalDto, @CurrentUser() user: any) {
    return this.service.addVital(id, dto, user);
  }

  @Post(':id/medications')
  @Roles('doctor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une administration de médicament' })
  addMedication(@Param('id') id: string, @Body() dto: AddMedicationDto, @CurrentUser() user: any) {
    return this.service.addMedication(id, dto, user);
  }

  @Post(':id/evolution-notes')
  @Roles('doctor')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une note d\'évolution' })
  addEvolutionNote(@Param('id') id: string, @Body() dto: AddEvolutionNoteDto, @CurrentUser() user: any) {
    return this.service.addEvolutionNote(id, dto, user);
  }
}
