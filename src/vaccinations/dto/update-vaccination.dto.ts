import { PartialType } from '@nestjs/swagger';
import { CreateVaccinationDto } from './create-vaccination.dto';

export class UpdateVaccinationDto extends PartialType(CreateVaccinationDto) {}
