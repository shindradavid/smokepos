import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SalesPaymentsService } from './sales-payments.service';
import { PaymentMethod, PaymentStatus, SalePayment } from '../entities/sale-payment.entity';
import { Sale, SaleStatus } from '../entities/sale.entity';

describe('SalesPaymentsService', () => {
  const manager = {
    findOne: jest.fn(),
    create: jest.fn((_entity, value) => value),
    save: jest.fn(async (value) => value),
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
  const paymentRepository = {} as Repository<SalePayment>;
  const auditLogsService = { logAction: jest.fn() };
  const branchAccessService = {
    assertCanAccess: jest.fn(),
    getAccessibleBranchIds: jest.fn(),
  };
  const service = new SalesPaymentsService(
    paymentRepository,
    dataSource,
    auditLogsService as any,
    branchAccessService as any
  );

  beforeEach(() => {
    jest.clearAllMocks();
    manager.save.mockImplementation(async (value) => value);
  });

  it('confirms a payment and updates the sale balance in one transaction', async () => {
    const payment = {
      id: 'payment-1',
      saleId: 'sale-1',
      amount: 80,
      status: PaymentStatus.PENDING,
    } as SalePayment;
    const sale = {
      id: 'sale-1',
      saleId: 'SALE-1',
      branchId: 'branch-1',
      totalAmount: 100,
      amountPaid: 20,
      balance: 80,
      status: SaleStatus.DELIVERED,
    } as Sale;
    manager.findOne.mockResolvedValueOnce(payment).mockResolvedValueOnce(sale);

    await service.processApproval(payment.id, { status: PaymentStatus.CONFIRMED }, 'staff-1');

    expect(payment.status).toBe(PaymentStatus.CONFIRMED);
    expect(sale.amountPaid).toBe(100);
    expect(sale.balance).toBe(0);
    expect(sale.status).toBe(SaleStatus.COMPLETED);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('rolls back approval when the payment exceeds the locked balance', async () => {
    const payment = {
      id: 'payment-1',
      saleId: 'sale-1',
      amount: 90,
      status: PaymentStatus.PENDING,
    } as SalePayment;
    const sale = {
      id: 'sale-1',
      saleId: 'SALE-1',
      branchId: 'branch-1',
      totalAmount: 100,
      amountPaid: 20,
      balance: 80,
      status: SaleStatus.PROCESSING,
    } as Sale;
    manager.findOne.mockResolvedValueOnce(payment).mockResolvedValueOnce(sale);

    await expect(
      service.processApproval(payment.id, { status: PaymentStatus.CONFIRMED }, 'staff-1')
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('does not record a payment against a cancelled sale', async () => {
    manager.findOne.mockResolvedValue({
      id: 'sale-1',
      saleId: 'SALE-1',
      branchId: 'branch-1',
      balance: 100,
      status: SaleStatus.CANCELLED,
    } as Sale);

    await expect(
      service.recordPayment('sale-1', { amount: 10, method: PaymentMethod.CASH }, 'staff-1')
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });
});
