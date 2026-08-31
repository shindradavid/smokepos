import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SalesService } from './sales.service';
import { Sale, SaleStatus } from '../entities/sale.entity';
import { Product } from '../../products/entities/product.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Customer } from '../../customers/entities/customer.entity';

describe('SalesService', () => {
  const saleRepository = { findOne: jest.fn() } as unknown as Repository<Sale>;
  const manager = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(async (value: unknown) => value),
  };
  const queryRunner = {
    manager,
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
  const dataSource = {
    createQueryRunner: jest.fn(() => queryRunner),
  } as unknown as DataSource;
  const auditLogsService = { logAction: jest.fn() };
  const stockAdjustmentsService = { createAdjustmentWithManager: jest.fn() };
  const branchAccessService = {
    assertCanAccess: jest.fn(),
    getAccessibleBranchIds: jest.fn(),
  };
  const service = new SalesService(
    saleRepository,
    {} as Repository<Product>,
    {} as Repository<Branch>,
    {} as Repository<Customer>,
    dataSource,
    auditLogsService as any,
    stockAdjustmentsService as any,
    branchAccessService as any
  );

  beforeEach(() => {
    jest.clearAllMocks();
    manager.save.mockImplementation(async (value: unknown) => value);
  });

  it('rejects duplicate product lines before changing stock', async () => {
    await expect(
      service.create(
        {
          branchId: '22222222-2222-4222-8222-222222222222',
          customerId: '11111111-1111-4111-8111-111111111111',
          items: [
            { productId: '33333333-3333-4333-8333-333333333333', quantity: 1 },
            { productId: '33333333-3333-4333-8333-333333333333', quantity: 12 },
          ],
        },
        'staff-1'
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('does not cancel and restore stock for a sale that has confirmed payments', async () => {
    manager.findOne.mockResolvedValue({
      id: 'sale-1',
      saleId: 'SALE-1',
      branchId: 'branch-1',
      amountPaid: 10,
      balance: 90,
      status: SaleStatus.PROCESSING,
    } as Sale);

    await expect(
      service.updateStatus('sale-1', SaleStatus.CANCELLED, 'staff-1')
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(stockAdjustmentsService.createAdjustmentWithManager).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });
});
