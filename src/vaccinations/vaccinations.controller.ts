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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VaccinationsService } from './vaccinations.service';
import { CreateVaccinationDto } from './dto/create-vaccination.dto';
import { UpdateVaccinationDto } from './dto/update-vaccination.dto';
import { VaccinationFilterDto } from './dto/vaccination-filter.dto';

@ApiTags('vaccinations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vaccinations')
export class VaccinationsController {
  constructor(private readonly vaccinationsService: VaccinationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les vaccinations' })
  findAll(@Query() filters: VaccinationFilterDto, @CurrentUser() user: any) {
    return this.vaccinationsService.findAll(filters, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir une vaccination par ID' })
  findOne(@Param('id') id: string) {
    return this.vaccinationsService.findOne(id);
  }

  @Post()
  @Roles('patient', 'doctor')
  @ApiOperation({ summary: 'Creer un enregistrement de vaccination' })
  create(@Body() dto: CreateVaccinationDto) {
    return this.vaccinationsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre a jour une vaccination' })
  update(@Param('id') id: string, @Body() dto: UpdateVaccinationDto) {
    return this.vaccinationsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une vaccination' })
  remove(@Param('id') id: string) {
    return this.vaccinationsService.remove(id);
  }
}
