import { IsString, IsNumber, IsOptional, IsIn, Min, Max, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateVouchersDto {
  @ApiProperty({ example: 'patient', description: 'Type de voucher: patient, doctor ou nurse' })
  @IsString()
  @IsIn(['patient', 'doctor', 'nurse'])
  type: 'patient' | 'doctor' | 'nurse';

  @ApiProperty({ example: 100, description: 'Nombre de vouchers a generer' })
  @IsNumber()
  @Min(1)
  @Max(1000)
  count: number;

  @ApiPropertyOptional({ example: 6, description: 'Duree en mois (defaut: 6)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  durationMonths?: number;

  @ApiPropertyOptional({ example: 100, description: 'Pourcentage de reduction (defaut: 100)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z', description: "Date d'expiration du voucher lui-meme" })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ValidateVoucherDto {
  @ApiProperty({ example: 'CP-PAT-X7K2M9', description: 'Code du voucher' })
  @IsString()
  code: string;
}

export class RedeemVoucherDto {
  @ApiProperty({ example: 'CP-PAT-X7K2M9', description: 'Code du voucher a utiliser' })
  @IsString()
  code: string;
}
