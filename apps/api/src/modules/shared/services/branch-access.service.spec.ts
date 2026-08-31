import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BranchAccessService } from './branch-access.service';

describe('BranchAccessService', () => {
  const findOne = jest.fn();
  const dataSource = {
    getRepository: jest.fn(() => ({ findOne })),
  } as unknown as DataSource;
  const service = new BranchAccessService(dataSource);

  beforeEach(() => jest.clearAllMocks());

  it('returns the branches assigned to the staff member', async () => {
    findOne.mockResolvedValue({
      id: 'staff-1',
      assignedBranches: [{ id: 'branch-1' }, { id: 'branch-2' }],
    });

    await expect(service.getAccessibleBranchIds('staff-1')).resolves.toEqual([
      'branch-1',
      'branch-2',
    ]);
  });

  it('rejects access to a branch that is not assigned', async () => {
    findOne.mockResolvedValue({
      id: 'staff-1',
      assignedBranches: [{ id: 'branch-1' }],
    });

    await expect(service.assertCanAccess('staff-1', 'branch-2')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('rejects a staff member with no assigned branches', async () => {
    findOne.mockResolvedValue({ id: 'staff-1', assignedBranches: [] });

    await expect(service.getAccessibleBranchIds('staff-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});
