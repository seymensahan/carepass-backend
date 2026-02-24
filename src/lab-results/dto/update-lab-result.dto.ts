import { PartialType } from '@nestjs/swagger';
import { CreateLabResultDto } from './create-lab-result.dto';

export class UpdateLabResultDto extends PartialType(CreateLabResultDto) {}
