import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  REQUIRED_ALL_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../decorators/require-permission.decorator';
import { Permission } from '../../modules/roles/entities/role.entity';
import { Staff } from '../../modules/staff/entities/staff.entity';
import { DataSource } from 'typeorm';

@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private reflector: Reflector,
    private dataSource: DataSource
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );
    const requiredAllPermissions = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_ALL_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!requiredAllPermissions || requiredAllPermissions.length === 0)
    ) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request['user'];

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Only admins/staff need permission checks
    if ((user as any).accountType !== 'admin') {
      // If it's a customer trying to access a permission-protected route, deny access
      // Unless we decide customers have permissions too, but spec says no.
      throw new ForbiddenException('Admin access required');
    }

    // Load staff account with roles and permissions
    // We use DataSource to avoid circular dependency with StaffModule/StaffService if possible,
    // or just to keep it simple.
    const staffRepo = this.dataSource.getRepository(Staff);
    const staff = await staffRepo.findOne({
      where: { userAccountId: (user as any).id },
      relations: ['roles', 'assignedBranches'],
    });

    if (!staff) {
      throw new ForbiddenException('Staff account not found');
    }

    const requestedBranchId =
      (request.body as any)?.branchId ||
      (request.query as any)?.branchId ||
      (request.params as any)?.branchId;
    if (
      typeof requestedBranchId === 'string' &&
      !staff.assignedBranches.some((branch) => branch.id === requestedBranchId)
    ) {
      throw new ForbiddenException('You do not have access to this branch');
    }

    (request as any).staff = staff;
    (request as any).accessibleBranchIds = staff.assignedBranches.map((branch) => branch.id);
    (request as any).user.staffId = staff.id;

    // Collect all permissions from all roles
    const userPermissions: Permission[] = [];
    staff.roles.forEach((role) => {
      userPermissions.push(...role.permissions);
    });

    // Check if user has at least one of the required permissions
    // OR logic: if route requires ['A', 'B'], user needs A OR B?
    // Usually it's AND for multiple decorators, but array arg usually means OR.
    // Let's assume OR for now (has ANY of the required permissions).
    const hasPermission =
      !requiredPermissions?.length ||
      requiredPermissions.some((required) => userPermissions.includes(required));
    const hasAllPermissions =
      !requiredAllPermissions?.length ||
      requiredAllPermissions.every((required) => userPermissions.includes(required));

    if (!hasPermission || !hasAllPermissions) {
      this.logger.warn(
        `Staff ${staff.id} attempted to access resource requiring permissions: ${[
          ...(requiredPermissions ?? []),
          ...(requiredAllPermissions ?? []),
        ].join(', ')}`
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
