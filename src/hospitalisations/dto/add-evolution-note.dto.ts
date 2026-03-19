import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddEvolutionNoteDto {
  @ApiProperty() @IsString() content: string;
}
