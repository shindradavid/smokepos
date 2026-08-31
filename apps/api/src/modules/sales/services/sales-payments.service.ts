import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SalePayment, PaymentStatus } from '../entities/sale-payment.entity';
import { Sale, SaleStatus } from '../entities/sale.entity';
import { RecordPaymentDto } from '../dto/record-payment.dto';
import { PaymentApprovalDto } from '../dto/payment-approval.dto';
import { PaymentsQueryDto } from '../dto/payments-query.dto';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { createPaginationMeta } from '../../../common/dto/pagination.dto';
import { BranchAccessService } from '../../shared/services/branch-access.service';

@Injectable()
export class SalesPaymentsService {
  constructor(
    @InjectRepository(SalePayment)
    private readonly paymentRepository: Repository<SalePayment>,
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
    private readonly branchAccessService: BranchAccessService
  ) {}

  /**
   * Find all payments with optional filters (status, branchId)
   */
  async findAll(query: PaymentsQueryDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view payments');
    }

    const { page = 1, limit = 20, status, branchId } = query;

    const skip = (page - 1) * limit;

    const qb = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.sale', 'sale')
      .leftJoinAndSelect('sale.customer', 'customer')
      .leftJoinAndSelect('payment.recordedBy', 'recordedBy')
      .leftJoinAndSelect('payment.approvedBy', 'approvedBy');

    // Filter by status
    if (status) {
      qb.andWhere('payment.status = :status', { status });
    }

    // Filter by branch (through sale relationship)
    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);
    if (branchId) {
      await this.branchAccessService.assertCanAccess(staffId, branchId);
      qb.andWhere('sale.branchId = :branchId', { branchId });
    } else {
      qb.andWhere('sale.branchId IN (:...accessibleBranchIds)', { accessibleBranchIds });
    }

    qb.orderBy('payment.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: createPaginationMeta(query, total),
    };
  }

  /**
   * Find a single payment by ID with all relations
   */
  async findOne(id: string, staffId?: string | null): Promise<SalePayment> {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: [
        'sale',
        'sale.customer',
        'sale.items',
        'sale.items.product',
        'recordedBy',
        'approvedBy',
      ],
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (staffId) {
      await this.branchAccessService.assertCanAccess(staffId, payment.sale.branchId);
    }

    return payment;
  }

  async recordPayment(
    saleId: string,
    dto: RecordPaymentDto,
    staffId?: string | null
  ): Promise<SalePayment> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to record payments');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedPayment: SalePayment;
    let saleCode: string;

    try {
      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: saleId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('Sale not found');

      await this.branchAccessService.assertCanAccess(staffId, sale.branchId);
      if (![SaleStatus.PROCESSING, SaleStatus.DELIVERED].includes(sale.status)) {
        throw new BadRequestException('Payments can only be recorded for active sales');
      }
      if (Number(dto.amount) > Number(sale.balance)) {
        throw new BadRequestException('Payment cannot exceed the outstanding balance');
      }

      saleCode = sale.saleId;
      const payment = queryRunner.manager.create(SalePayment, {
        saleId: sale.id,
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference,
        notes: dto.notes,
        recordedById: staffId,
        status: PaymentStatus.PENDING,
      });

      savedPayment = await queryRunner.manager.save(payment);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'RECORD_PAYMENT',
      entity: 'sale_payment',
      entityId: savedPayment.id,
      description: `Recorded payment of ${dto.amount} for sale ${saleCode!}`,
      details: { saleId: saleCode!, amount: dto.amount, method: dto.method },
    });

    return savedPayment;
  }

  async processApproval(
    paymentId: string,
    dto: PaymentApprovalDto,
    staffId?: string | null
  ): Promise<SalePayment> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to process payment approvals');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let payment: SalePayment;
    let saleCode: string;

    try {
      const lockedPayment = await queryRunner.manager.findOne(SalePayment, {
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedPayment) throw new NotFoundException('Payment not found');
      if (lockedPayment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Payment is already processed');
      }

      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id: lockedPayment.saleId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException('Sale not found');

      await this.branchAccessService.assertCanAccess(staffId, sale.branchId);
      if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.COMPLETED) {
        throw new BadRequestException('Payment cannot be approved for a closed sale');
      }
      if (
        dto.status === PaymentStatus.CONFIRMED &&
        Number(lockedPayment.amount) > Number(sale.balance)
      ) {
        throw new BadRequestException('Payment exceeds the outstanding balance');
      }

      payment = lockedPayment;
      saleCode = sale.saleId;
      payment.status = dto.status;
      payment.approvedById = staffId;
      payment.approvedAt = new Date();
      if (dto.notes) payment.notes = dto.notes;

      await queryRunner.manager.save(payment);
      if (dto.status === PaymentStatus.CONFIRMED) {
        sale.amountPaid = Number(sale.amountPaid) + Number(payment.amount);
        sale.balance = Number(sale.totalAmount) - Number(sale.amountPaid);
        if (sale.status === SaleStatus.DELIVERED && sale.balance === 0) {
          sale.status = SaleStatus.COMPLETED;
        }
        await queryRunner.manager.save(sale);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const actionVerb = dto.status === PaymentStatus.CONFIRMED ? 'approved' : 'denied';
    await this.auditLogsService.logAction({
      staffId,
      action: dto.status === PaymentStatus.CONFIRMED ? 'APPROVE_PAYMENT' : 'DENY_PAYMENT',
      entity: 'sale_payment',
      entityId: payment!.id,
      description: `Payment of ${payment!.amount} ${actionVerb} for sale ${saleCode!}`,
      details: { paymentId: payment!.id, amount: payment!.amount, status: dto.status },
    });

    return payment!;
  }

  /**
   * Get pending payments count for a branch (for sidebar badge)
   */
  async getPendingCount(branchId: string, staffId?: string | null): Promise<{ pending: number }> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view payments');
    }
    await this.branchAccessService.assertCanAccess(staffId, branchId);

    const pending = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.sale', 'sale')
      .where('payment.status = :status', { status: PaymentStatus.PENDING })
      .andWhere('sale.branchId = :branchId', { branchId })
      .getCount();

    return { pending };
  }
}
