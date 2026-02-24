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
import { LabResultsService } from './lab-results.service';
import { CreateLabResultDto } from './dto/create-lab-result.dto';
import { UpdateLabResultDto } from './dto/update-lab-result.dto';
import { LabResultFilterDto } from './dto/lab-result-filter.dto';

@ApiTags('lab-results')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lab-results')
export class LabResultsController {
  constructor(private readonly labResultsService: LabResultsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les resultats de laboratoire' })
  findAll(@Query() filters: LabResultFilterDto, @CurrentUser() user: any) {
    return this.labResultsService.findAll(filters, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un resultat de laboratoire par ID' })
  findOne(@Param('id') id: string) {
    return this.labResultsService.findOne(id);
  }

  @Post()
  @Roles('lab', 'doctor')
  @ApiOperation({ summary: 'Creer un resultat de laboratoire' })
  create(@Body() dto: CreateLabResultDto, @CurrentUser() user: any) {
    return this.labResultsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre a jour un resultat de laboratoire' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLabResultDto,
    @CurrentUser() user: any,
  ) {
    return this.labResultsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un resultat de laboratoire' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.labResultsService.remove(id, user.id, user.role);
  }

  @Patch(':id/validate')
  @Roles('doctor')
  @ApiOperation({ summary: 'Valider un resultat de laboratoire' })
  validate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.labResultsService.validate(id, user.id);
  }
}
