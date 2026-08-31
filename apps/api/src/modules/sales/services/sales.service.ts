import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, ILike, In, EntityManager, QueryRunner } from 'typeorm';
import { Sale, SaleStatus } from '../entities/sale.entity';
import { SaleItem } from '../entities/sale-item.entity';
import { PaymentStatus, SalePayment } from '../entities/sale-payment.entity';
import { CreateSaleDto } from '../dto/create-sale.dto';
import { SalesQueryDto } from '../dto/sales-query.dto';
import { Product } from '../../products/entities/product.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { StockAdjustmentsService } from '../../products/services/stock-adjustments.service';
import { StockAdjustmentType } from '../../products/entities/stock-adjustment.entity';
import { format } from 'date-fns';
import { BranchAccessService } from '../../shared/services/branch-access.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
    private readonly stockAdjustmentsService: StockAdjustmentsService,
    private readonly branchAccessService: BranchAccessService
  ) {}

  async create(createSaleDto: CreateSaleDto, staffId?: string | null): Promise<Sale> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to create sales');
    }

    const { branchId, customerId, items, notes } = createSaleDto;

    await this.branchAccessService.assertCanAccess(staffId, branchId);

    const productIds = items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('A product can only appear once in a sale');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate Branch exists
      const branch = await queryRunner.manager.findOne(Branch, { where: { id: branchId } });
      if (!branch) throw new NotFoundException('Branch not found');

      // 2. A customer is optional for fast walk-in POS sales.
      let customer: Customer | null = null;
      if (customerId) {
        customer = await queryRunner.manager.findOne(Customer, { where: { id: customerId } });
        if (!customer) throw new NotFoundException('Customer not found');
        if (customer.branchId && customer.branchId !== branchId) {
          throw new BadRequestException('Customer does not belong to the selected branch');
        }
      }

      // 3. Generate Deterministic ID with lock to prevent race conditions
      const saleId = await this.generateSaleIdWithLock(queryRunner, branch.slug);

      // 4. Process Items, Validate Stock & Calculate Totals
      let subtotal = 0;
      const saleItems: SaleItem[] = [];

      // Acquire all inventory locks in a stable order to avoid deadlocks when
      // two sales contain the same products in different UI order.
      const lockedProducts = await queryRunner.manager
        .createQueryBuilder(Product, 'product')
        .where('product.id IN (:...productIds)', { productIds })
        .orderBy('product.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      if (lockedProducts.length !== productIds.length) {
        throw new NotFoundException('One or more products were not found');
      }
      const lockedProductMap = new Map(lockedProducts.map((product) => [product.id, product]));

      // Collect product snapshots for stock adjustment logging after sale is saved
      const stockAdjustmentData: {
        productId: string;
        previousQty: number;
        newQty: number;
        costPrice: number | null;
      }[] = [];

      for (const itemDto of items) {
        const product = lockedProductMap.get(itemDto.productId)!;
        if (product.branchId !== branchId) {
          throw new BadRequestException(`Product "${product.name}" does not belong to this branch`);
        }
        if (!product.isActive) {
          throw new BadRequestException(`Product "${product.name}" is inactive`);
        }

        // Validate sufficient stock
        if (product.quantity < itemDto.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}". Available: ${product.quantity}, Requested: ${itemDto.quantity}`
          );
        }

        const previousQty = product.quantity;

        // Deduct stock
        product.quantity -= itemDto.quantity;
        await queryRunner.manager.save(product);

        const totalPrice = Number(product.price) * itemDto.quantity;
        subtotal += totalPrice;

        const saleItem = queryRunner.manager.create(SaleItem, {
          productId: itemDto.productId,
          quantity: itemDto.quantity,
          unitPrice: product.price,
          unitCost: product.costPrice, // Snapshot cost at time of sale
        });
        saleItems.push(saleItem);

        stockAdjustmentData.push({
          productId: product.id,
          previousQty,
          newQty: product.quantity,
          costPrice: product.costPrice,
        });
      }

      // 5. Calculate Taxes & Total
      const taxAmount = 0;
      const totalAmount = subtotal + taxAmount;

      // 6. Create Sale
      const sale = queryRunner.manager.create(Sale, {
        saleId,
        branchId,
        customerId: customerId ?? null,
        createdById: staffId,
        status: SaleStatus.PROCESSING,
        customerSource: createSaleDto.customerSource,
        subtotal,
        taxAmount,
        totalAmount,
        balance: totalAmount, // Initial balance, will be updated if paid
        amountPaid: 0,
        notes,
        items: saleItems,
      });

      const savedSale = await queryRunner.manager.save(sale);

      if (createSaleDto.initialPayment && createSaleDto.initialPayment.amount > 0) {
        const { amount, method, reference, notes: paymentNotes } = createSaleDto.initialPayment;

        if (amount > totalAmount) {
          throw new BadRequestException('Initial payment cannot exceed the sale total');
        }

        const payment = queryRunner.manager.create(SalePayment, {
          saleId: savedSale.id, // Link to saved sale
          amount,
          method,
          reference,
          notes: paymentNotes || 'Initial payment at sale creation',
          status: PaymentStatus.CONFIRMED,
          recordedById: staffId,
          approvedById: staffId,
          approvedAt: new Date(),
        });

        await queryRunner.manager.save(payment);

        // Update Sale Balance
        savedSale.amountPaid = amount;
        savedSale.balance = Number(savedSale.totalAmount) - Number(amount);

        // If fully paid, change status?
        // Keeping as PROCESSING as per business logic usually implies "being worked on",
        // but if balance is 0 and it's essentially done?
        // Leaving logic: "Auto-complete if Delivered and paid" exists in updateBalance.
        // Here we just update.

        await queryRunner.manager.save(savedSale);
      }

      // Log stock adjustments for each item
      for (let i = 0; i < stockAdjustmentData.length; i++) {
        const adj = stockAdjustmentData[i];
        const itemQty = items[i].quantity;
        await this.stockAdjustmentsService.createAdjustmentWithManager(queryRunner.manager, {
          productId: adj.productId,
          branchId,
          adjustmentType: StockAdjustmentType.SALE,
          quantityChange: -itemQty,
          previousQuantity: adj.previousQty,
          newQuantity: adj.newQty,
          unitCost: adj.costPrice,
          previousCostPrice: adj.costPrice,
          newCostPrice: adj.costPrice, // Cost doesn't change on sale
          referenceType: 'sale',
          referenceId: savedSale.id,
          referenceCode: saleId,
          staffId,
        });
      }

      await queryRunner.commitTransaction();

      // Audit log
      await this.auditLogsService.logAction({
        staffId,
        action: 'CREATE',
        entity: 'sale',
        entityId: sale.id,
        description: `Created sale ${saleId} for ${customer?.name ?? 'a walk-in customer'}`,
        details: { saleId, customerId, branchId, totalAmount, itemCount: items.length },
      });

      return this.findOne(sale.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(query: SalesQueryDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view sales');
    }

    const {
      page = 1,
      limit = 20,
      search,
      status,
      customerId,
      branchId,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) where.saleId = ILike(`%${search}%`);
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);
    if (branchId) {
      if (!accessibleBranchIds.includes(branchId)) {
        throw new UnauthorizedException('You do not have access to this branch');
      }
      where.branchId = branchId;
    } else {
      where.branchId = In(accessibleBranchIds);
    }
    if (startDate && endDate) {
      where.createdAt = Between(new Date(startDate), new Date(endDate));
    }

    const [data, total] = await this.saleRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['customer', 'branch', 'createdBy'],
    });

    return {
      data,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, staffId?: string | null): Promise<Sale> {
    const sale = await this.saleRepository.findOne({
      where: { id },
      relations: ['items', 'items.product', 'payments', 'customer', 'branch', 'createdBy'],
    });
    if (!sale) throw new NotFoundException(`Sale with ID ${id} not found`);
    if (staffId) {
      await this.branchAccessService.assertCanAccess(staffId, sale.branchId);
    }
    return sale;
  }

  async updateStatus(id: string, newStatus: SaleStatus, staffId?: string | null): Promise<Sale> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to update sale status');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let oldStatus: SaleStatus;
    let saleId: string;

    try {
      const sale = await queryRunner.manager.findOne(Sale, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!sale) throw new NotFoundException(`Sale with ID ${id} not found`);

      await this.branchAccessService.assertCanAccess(staffId, sale.branchId);
      oldStatus = sale.status;
      saleId = sale.saleId;

      this.validateStateTransition(sale.status, newStatus, sale.balance);

      if (newStatus === SaleStatus.CANCELLED) {
        if (Number(sale.amountPaid) > 0) {
          throw new BadRequestException(
            'A paid sale cannot be cancelled. Record a client-specific refund or credit process instead.'
          );
        }

        sale.items = await queryRunner.manager.find(SaleItem, { where: { saleId: sale.id } });
        await this.restoreStock(queryRunner.manager, sale, staffId);
      }

      sale.status = newStatus;
      await queryRunner.manager.save(sale);
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
      action: 'UPDATE_STATUS',
      entity: 'sale',
      entityId: id,
      description: `Changed sale ${saleId!} status from ${oldStatus!} to ${newStatus}`,
      details: { saleId: saleId!, oldStatus: oldStatus!, newStatus },
    });

    return this.findOne(id, staffId);
  }

  private async restoreStock(manager: EntityManager, sale: Sale, staffId: string): Promise<void> {
    const sortedItems = [...sale.items].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const item of sortedItems) {
      const product = await manager.findOne(Product, {
        where: { id: item.productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (product) {
        const previousQty = product.quantity;
        product.quantity += item.quantity;
        await manager.save(product);

        // Log stock adjustment for cancellation
        await this.stockAdjustmentsService.createAdjustmentWithManager(manager, {
          productId: product.id,
          branchId: sale.branchId,
          adjustmentType: StockAdjustmentType.SALE_CANCELLATION,
          quantityChange: item.quantity,
          previousQuantity: previousQty,
          newQuantity: product.quantity,
          unitCost: item.unitCost,
          previousCostPrice: product.costPrice,
          newCostPrice: product.costPrice, // Cost doesn't change on cancellation
          referenceType: 'sale',
          referenceId: sale.id,
          referenceCode: sale.saleId,
          staffId,
        });
      }
    }
  }

  private validateStateTransition(current: SaleStatus, next: SaleStatus, balance: number) {
    if (current === next) return;
    if (current === SaleStatus.COMPLETED || current === SaleStatus.CANCELLED) {
      throw new BadRequestException(`Cannot change status from terminal state ${current}`);
    }

    const allowed: Record<SaleStatus, SaleStatus[]> = {
      [SaleStatus.PROCESSING]: [SaleStatus.DELIVERED, SaleStatus.CANCELLED],
      [SaleStatus.DELIVERED]: [SaleStatus.COMPLETED, SaleStatus.CANCELLED],
      [SaleStatus.COMPLETED]: [],
      [SaleStatus.CANCELLED]: [],
    };

    if (!allowed[current].includes(next)) {
      throw new BadRequestException(`Invalid status transition from ${current} to ${next}`);
    }

    if (next === SaleStatus.COMPLETED && balance > 0) {
      throw new BadRequestException('Cannot complete sale with outstanding balance');
    }
  }

  private async generateSaleIdWithLock(
    queryRunner: QueryRunner,
    branchSlug: string
  ): Promise<string> {
    const slug = branchSlug.toUpperCase();
    const dateStr = format(new Date(), 'yyyyMM');
    const prefix = `QWIK-${slug}-${dateStr}-`;

    // The advisory transaction lock also protects the first sale for a new prefix,
    // when there is no existing row that SELECT ... FOR UPDATE could lock.
    await queryRunner.manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);

    const result = await queryRunner.manager.query(
      `SELECT sale_id FROM sales WHERE sale_id LIKE $1 ORDER BY sale_id DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let sequence = 1;
    if (result && result.length > 0) {
      const lastSaleId = result[0].sale_id;
      const parts = lastSaleId.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }

    return `${prefix}${sequence.toString().padStart(6, '0')}`;
  }
}
