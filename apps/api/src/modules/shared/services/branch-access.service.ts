import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Staff } from '../../staff/entities/staff.entity';

@Injectable()
export class BranchAccessService {
  constructor(private readonly dataSource: DataSource) {}

  async getAccessibleBranchIds(staffId: string): Promise<string[]> {
    const staff = await this.dataSource.getRepository(Staff).findOne({
      where: { id: staffId },
      relations: ['assignedBranches'],
    });

    if (!staff) {
      throw new ForbiddenException('Staff account not found');
    }

    const branchIds = staff.assignedBranches.map((branch) => branch.id);
    if (branchIds.length === 0) {
      throw new ForbiddenException('Staff member is not assigned to a branch');
    }

    return branchIds;
  }

  async assertCanAccess(staffId: string, branchId: string): Promise<void> {
    const branchIds = await this.getAccessibleBranchIds(staffId);
    if (!branchIds.includes(branchId)) {
      throw new ForbiddenException('You do not have access to this branch');
    }
  }
}
