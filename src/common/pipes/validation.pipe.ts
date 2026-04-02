import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class CarypassIdPipe implements PipeTransform<string> {
  transform(value: string): string {
    const regex = /^CP-\d{4}-\d{5}$/;
    if (!regex.test(value)) {
      throw new BadRequestException('Format CaryPass ID invalide (attendu: CP-YYYY-NNNNN)');
    }
    return value;
  }
}
