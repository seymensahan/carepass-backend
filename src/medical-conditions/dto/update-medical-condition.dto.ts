import { PartialType } from '@nestjs/swagger';
import { CreateMedicalConditionDto } from './create-medical-condition.dto';

export class UpdateMedicalConditionDto extends PartialType(CreateMedicalConditionDto) {}
