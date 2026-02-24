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
import { AllergiesService } from './allergies.service';
import { CreateAllergyDto } from './dto/create-allergy.dto';
import { UpdateAllergyDto } from './dto/update-allergy.dto';

@ApiTags('allergies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('allergies')
export class AllergiesController {
  constructor(private readonly allergiesService: AllergiesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les allergies d\'un patient' })
  findAll(@Query('patientId') patientId: string) {
    return this.allergiesService.findAll(patientId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une allergie par ID' })
  findOne(@Param('id') id: string) {
    return this.allergiesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Creer un enregistrement d\'allergie' })
  create(@Body() dto: CreateAllergyDto) {
    return this.allergiesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre a jour une allergie' })
  update(@Param('id') id: string, @Body() dto: UpdateAllergyDto) {
    return this.allergiesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une allergie' })
  remove(@Param('id') id: string) {
    return this.allergiesService.remove(id);
  }
}
