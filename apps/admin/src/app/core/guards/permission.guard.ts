import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const PermissionGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);

  const requiredPermission = route.data['permission'] as string | undefined;
  const requiredPermissions = route.data['permissions'] as string[] | undefined;
  const anyPermissions = route.data['anyPermissions'] as string[] | undefined;
  const permissions = requiredPermissions ?? (requiredPermission ? [requiredPermission] : []);

  if (permissions.length === 0 && !anyPermissions?.length) return true;

  const hasRequiredPermissions = permissions.every((permission) =>
    authService.hasPermission(permission)
  );
  const hasAnyPermission =
    !anyPermissions?.length ||
    anyPermissions.some((permission) => authService.hasPermission(permission));

  return hasRequiredPermissions && hasAnyPermission;
};
