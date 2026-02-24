import { SetMetadata } from '@nestjs/common';

export type Role = 'patient' | 'doctor' | 'institution_admin' | 'lab' | 'insurance' | 'super_admin';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
