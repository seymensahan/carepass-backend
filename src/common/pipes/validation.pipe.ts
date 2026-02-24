import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class CarepassIdPipe implements PipeTransform<string> {
  transform(value: string): string {
    const regex = /^CP-\d{4}-\d{5}$/;
    if (!regex.test(value)) {
      throw new BadRequestException('Format CarePass ID invalide (attendu: CP-YYYY-NNNNN)');
    }
    return value;
  }
}
