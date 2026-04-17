import { IsString, IsOptional, IsDateString, IsIn, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type GrantDuration = '24h' | '1_semaine' | '1_mois' | '3_mois' | 'permanent';

export class CreateAccessGrantDto {
  @ApiProperty({ description: 'ID du médecin à qui accorder l\'accès', example: 'uuid-doctor-id' })
  @IsString()
  doctorId: string;

  @ApiPropertyOptional({ description: 'Portée de l\'accès', example: 'full', default: 'full' })
  @IsOptional()
  @IsString()
  scope?: string = 'full';

  @ApiPropertyOptional({
    description: 'Durée de l\'accès. Le backend convertit en expiresAt.',
    enum: ['24h', '1_semaine', '1_mois', '3_mois', 'permanent'],
  })
  @IsOptional()
  @IsIn(['24h', '1_semaine', '1_mois', '3_mois', 'permanent'])
  duration?: GrantDuration;

  @ApiPropertyOptional({ description: 'Date d\'expiration de l\'accès (ISO 8601) — si fournie, prime sur duration', example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Permissions granulaires', example: { consultations: true, labResults: true } })
  @IsOptional()
  @IsObject()
  permissions?: Record<string, boolean>;
}

/**
 * Convert a duration string to a Date.
 * Returns null for 'permanent' (= no expiration).
 */
export function durationToExpiresAt(duration?: GrantDuration | null): Date | null {
  if (!duration || duration === 'permanent') return null;
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  switch (duration) {
    case '24h': return new Date(now + msPerDay);
    case '1_semaine': return new Date(now + 7 * msPerDay);
    case '1_mois': return new Date(now + 30 * msPerDay);
    case '3_mois': return new Date(now + 90 * msPerDay);
    default: return null;
  }
}
