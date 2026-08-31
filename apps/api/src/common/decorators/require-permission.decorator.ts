import { SetMetadata } from '@nestjs/common';
import { Permission } from '../../modules/roles/entities/role.entity';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';
export const REQUIRED_ALL_PERMISSIONS_KEY = 'requiredAllPermissions';

export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const RequireAllPermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_ALL_PERMISSIONS_KEY, permissions);
