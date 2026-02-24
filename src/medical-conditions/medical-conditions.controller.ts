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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { MedicalConditionsService } from './medical-conditions.service';
import { CreateMedicalConditionDto } from './dto/create-medical-condition.dto';
import { UpdateMedicalConditionDto } from './dto/update-medical-condition.dto';

@ApiTags('medical-conditions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('medical-conditions')
export class MedicalConditionsController {
  constructor(
    private readonly medicalConditionsService: MedicalConditionsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister les conditions medicales d\'un patient' })
  findAll(@Query('patientId') patientId: string) {
    return this.medicalConditionsService.findAll(patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une condition medicale par ID' })
  findOne(@Param('id') id: string) {
    return this.medicalConditionsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Creer un enregistrement de condition medicale' })
  create(@Body() dto: CreateMedicalConditionDto) {
    return this.medicalConditionsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre a jour une condition medicale' })
  update(@Param('id') id: string, @Body() dto: UpdateMedicalConditionDto) {
    return this.medicalConditionsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une condition medicale' })
  remove(@Param('id') id: string) {
    return this.medicalConditionsService.remove(id);
  }
}
