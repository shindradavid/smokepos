import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In, DataSource, QueryRunner } from 'typeorm';
import { PurchaseOrder, PurchaseOrderStatus } from '../entities/purchase-order.entity';
import { PurchaseOrderItem } from '../entities/purchase-order-item.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Supplier } from '../entities/supplier.entity';
import { Product } from '../../products/entities/product.entity';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrdersQueryDto,
  ReceiveItemsDto,
  RejectPurchaseOrderDto,
} from '../dto';
import { createPaginationMeta } from '../../../common/dto/pagination.dto';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { StockAdjustmentsService } from '../../products/services/stock-adjustments.service';
import { StockAdjustmentType } from '../../products/entities/stock-adjustment.entity';
import { BranchAccessService } from '../../shared/services/branch-access.service';
import { calculatePurchaseOrderTotal } from '../utils/purchase-order-total';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly poItemRepository: Repository<PurchaseOrderItem>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly auditLogsService: AuditLogsService,
    private readonly dataSource: DataSource,
    private readonly stockAdjustmentsService: StockAdjustmentsService,
    private readonly branchAccessService: BranchAccessService
  ) {}

  /**
   * Generate PO number: PO-{BRANCH_SLUG}-{YYYYMM}-{SEQ}
   */
  private async generatePoNumber(queryRunner: QueryRunner, branch: Branch): Promise<string> {
    const branchCode = branch.slug.toUpperCase().replace(/-/g, '');
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `PO-${branchCode}-${yearMonth}-`;

    await queryRunner.manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [prefix]);

    const lastPo = await queryRunner.manager
      .createQueryBuilder(PurchaseOrder, 'po')
      .where('po.poNumber LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('po.poNumber', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastPo) {
      const lastSeq = parseInt(lastPo.poNumber.split('-').pop() || '0', 10);
      sequence = lastSeq + 1;
    }

    return `${prefix}${String(sequence).padStart(3, '0')}`;
  }

  /**
   * Validate that status allows editing
   */
  private validateEditableStatus(status: PurchaseOrderStatus): void {
    const editableStatuses = [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL];
    if (!editableStatuses.includes(status)) {
      throw new BadRequestException(
        `Purchase order cannot be modified in ${status} status. Only draft or pending approval orders can be edited.`
      );
    }
  }

  async create(createDto: CreatePurchaseOrderDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to create purchase orders');
    }

    await this.branchAccessService.assertCanAccess(staffId, createDto.branchId);

    const productIds = createDto.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('A product can only appear once in a purchase order');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let saved!: PurchaseOrder;

    try {
      // Validate branch
      const branch = await queryRunner.manager.findOne(Branch, {
        where: { id: createDto.branchId },
      });
      if (!branch) {
        throw new BadRequestException('Invalid branch');
      }

      // Validate supplier belongs to branch
      const supplier = await queryRunner.manager.findOne(Supplier, {
        where: { id: createDto.supplierId, branchId: createDto.branchId },
      });
      if (!supplier) {
        throw new BadRequestException('Supplier not found or does not belong to this branch');
      }

      const products = await queryRunner.manager.find(Product, {
        where: { id: In(productIds) },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException('One or more products not found');
      }
      if (products.some((product) => product.branchId !== createDto.branchId)) {
        throw new BadRequestException('All products must belong to the purchase order branch');
      }

      const productMap = new Map(products.map((p) => [p.id, p]));

      const poNumber = await this.generatePoNumber(queryRunner, branch);

      // Create items with product snapshots
      const items = createDto.items.map((itemDto) => {
        const product = productMap.get(itemDto.productId)!;
        return queryRunner.manager.create(PurchaseOrderItem, {
          productId: itemDto.productId,
          productName: product.name,
          productSku: product.sku,
          quantity: itemDto.quantity,
          unitCost: itemDto.unitCost,
          receivedQuantity: 0,
        });
      });

      const totalAmount = calculatePurchaseOrderTotal(createDto.items);

      const po = queryRunner.manager.create(PurchaseOrder, {
        poNumber,
        supplierId: createDto.supplierId,
        branchId: createDto.branchId,
        status: createDto.status || PurchaseOrderStatus.DRAFT,
        expectedDeliveryDate: createDto.expectedDeliveryDate
          ? new Date(createDto.expectedDeliveryDate)
          : null,
        notes: createDto.notes,
        totalAmount,
        createdById: staffId,
        items,
      });

      saved = await queryRunner.manager.save(po);
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
      action: 'CREATE',
      entity: 'purchaseOrder',
      entityId: saved.id,
      description: `Created purchase order: ${saved.poNumber}`,
      details: {
        poNumber: saved.poNumber,
        supplierId: saved.supplierId,
        totalAmount: saved.totalAmount,
      },
    });

    return this.findOne(saved.id, staffId);
  }

  async findAll(query: PurchaseOrdersQueryDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view purchase orders');
    }

    const { page = 1, limit = 20, branchId, supplierId, status, search } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.poRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.branch', 'branch')
      .leftJoinAndSelect('po.createdBy', 'createdBy')
      .leftJoinAndSelect('po.approvedBy', 'approvedBy');

    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);
    if (branchId) {
      await this.branchAccessService.assertCanAccess(staffId, branchId);
      queryBuilder.andWhere('po.branchId = :branchId', { branchId });
    } else {
      queryBuilder.andWhere('po.branchId IN (:...accessibleBranchIds)', { accessibleBranchIds });
    }

    if (supplierId) {
      queryBuilder.andWhere('po.supplierId = :supplierId', { supplierId });
    }

    if (status) {
      queryBuilder.andWhere('po.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere('(po.poNumber ILIKE :search OR supplier.name ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    queryBuilder.orderBy('po.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      pagination: createPaginationMeta({ page, limit }, total),
    };
  }

  async findOne(id: string, staffId?: string | null) {
    const po = await this.poRepository.findOne({
      where: { id },
      relations: ['supplier', 'branch', 'createdBy', 'approvedBy', 'items', 'items.product'],
    });

    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    if (staffId) {
      await this.branchAccessService.assertCanAccess(staffId, po.branchId);
    }

    return po;
  }

  async update(id: string, updateDto: UpdatePurchaseOrderDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to update purchase orders');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let updated!: PurchaseOrder;

    try {
      const po = await queryRunner.manager.findOne(PurchaseOrder, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!po) throw new NotFoundException('Purchase order not found');

      await this.branchAccessService.assertCanAccess(staffId, po.branchId);
      this.validateEditableStatus(po.status);

      if (updateDto.supplierId) {
        const supplier = await queryRunner.manager.findOne(Supplier, {
          where: { id: updateDto.supplierId, branchId: po.branchId },
        });
        if (!supplier) {
          throw new BadRequestException('Supplier not found or does not belong to this branch');
        }
        po.supplierId = updateDto.supplierId;
      }

      if (updateDto.expectedDeliveryDate !== undefined) {
        po.expectedDeliveryDate = updateDto.expectedDeliveryDate
          ? new Date(updateDto.expectedDeliveryDate)
          : null;
      }

      if (updateDto.notes !== undefined) {
        po.notes = updateDto.notes;
      }

      if (updateDto.status !== undefined) {
        if (
          updateDto.status !== PurchaseOrderStatus.DRAFT &&
          updateDto.status !== PurchaseOrderStatus.PENDING_APPROVAL
        ) {
          throw new BadRequestException('Can only set status to draft or pending_approval');
        }
        po.status = updateDto.status;
      }

      if (updateDto.items) {
        if (updateDto.items.length === 0) {
          throw new BadRequestException('Purchase order must contain at least one item');
        }

        const productIds = updateDto.items.map((item) => item.productId);
        if (new Set(productIds).size !== productIds.length) {
          throw new BadRequestException('A product can only appear once in a purchase order');
        }

        const products = await queryRunner.manager.find(Product, {
          where: { id: In(productIds) },
        });
        if (products.length !== productIds.length) {
          throw new BadRequestException('One or more products not found');
        }
        if (products.some((product) => product.branchId !== po.branchId)) {
          throw new BadRequestException('All products must belong to the purchase order branch');
        }
        const productMap = new Map(products.map((product) => [product.id, product]));

        await queryRunner.manager.delete(PurchaseOrderItem, { purchaseOrderId: po.id });
        const newItems = updateDto.items.map((itemDto) => {
          const product = productMap.get(itemDto.productId)!;
          return queryRunner.manager.create(PurchaseOrderItem, {
            purchaseOrderId: po.id,
            productId: itemDto.productId,
            productName: product.name,
            productSku: product.sku,
            quantity: itemDto.quantity,
            unitCost: itemDto.unitCost,
            receivedQuantity: 0,
          });
        });
        await queryRunner.manager.save(newItems);
        po.totalAmount = calculatePurchaseOrderTotal(updateDto.items);
      }

      updated = await queryRunner.manager.save(po);
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
      action: 'UPDATE',
      entity: 'purchaseOrder',
      entityId: updated.id,
      description: `Updated purchase order: ${updated.poNumber}`,
      details: updateDto,
    });

    return this.findOne(updated.id, staffId);
  }

  async remove(id: string, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to delete purchase orders');
    }

    const po = await this.findOne(id, staffId);

    // Only allow deleting draft orders
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft purchase orders can be deleted');
    }

    await this.poRepository.remove(po);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'DELETE',
      entity: 'purchaseOrder',
      entityId: id,
      description: `Deleted purchase order: ${po.poNumber}`,
      details: { poNumber: po.poNumber },
    });

    return { message: 'Purchase order deleted successfully' };
  }

  async approve(id: string, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to approve purchase orders');
    }

    const po = await this.findOne(id, staffId);

    if (po.status !== PurchaseOrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending approval orders can be approved');
    }

    po.status = PurchaseOrderStatus.APPROVED;
    po.approvedById = staffId;
    po.approvedAt = new Date();
    po.rejectionReason = null;

    const updated = await this.poRepository.save(po);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'APPROVE',
      entity: 'purchaseOrder',
      entityId: updated.id,
      description: `Approved purchase order: ${updated.poNumber}`,
      details: { poNumber: updated.poNumber },
    });

    return this.findOne(updated.id, staffId);
  }

  async reject(id: string, rejectDto: RejectPurchaseOrderDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to reject purchase orders');
    }

    const po = await this.findOne(id, staffId);

    if (po.status !== PurchaseOrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending approval orders can be rejected');
    }

    po.status = PurchaseOrderStatus.DRAFT;
    po.rejectionReason = rejectDto.reason;

    const updated = await this.poRepository.save(po);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'REJECT',
      entity: 'purchaseOrder',
      entityId: updated.id,
      description: `Rejected purchase order: ${updated.poNumber}`,
      details: { poNumber: updated.poNumber, reason: rejectDto.reason },
    });

    return this.findOne(updated.id, staffId);
  }

  async cancel(id: string, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to cancel purchase orders');
    }

    const po = await this.findOne(id, staffId);

    // Only draft or pending_approval can be cancelled
    const cancellableStatuses = [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL];
    if (!cancellableStatuses.includes(po.status)) {
      throw new BadRequestException(
        `Cannot cancel purchase order in ${po.status} status. Only draft or pending approval orders can be cancelled.`
      );
    }

    po.status = PurchaseOrderStatus.CANCELLED;

    const updated = await this.poRepository.save(po);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'CANCEL',
      entity: 'purchaseOrder',
      entityId: updated.id,
      description: `Cancelled purchase order: ${updated.poNumber}`,
      details: { poNumber: updated.poNumber },
    });

    return this.findOne(updated.id, staffId);
  }

  async receiveItems(id: string, receiveDto: ReceiveItemsDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to receive items');
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let poNumber!: string;
    let newStatus!: PurchaseOrderStatus;
    const inventoryUpdates: Record<string, unknown>[] = [];

    try {
      const po = await queryRunner.manager.findOne(PurchaseOrder, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!po) {
        throw new NotFoundException('Purchase order not found');
      }

      await this.branchAccessService.assertCanAccess(staffId, po.branchId);

      const receivableStatuses = [
        PurchaseOrderStatus.APPROVED,
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
      ];
      if (!receivableStatuses.includes(po.status)) {
        throw new BadRequestException(
          `Cannot receive items for purchase order in ${po.status} status. Only approved or partially received orders can receive items.`
        );
      }

      const poItems = await queryRunner.manager
        .createQueryBuilder(PurchaseOrderItem, 'item')
        .where('item.purchaseOrderId = :purchaseOrderId', { purchaseOrderId: po.id })
        .orderBy('item.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      const itemMap = new Map(poItems.map((item) => [item.id, item]));

      for (const receiveItem of receiveDto.items) {
        const poItem = itemMap.get(receiveItem.itemId);
        if (!poItem) {
          throw new BadRequestException(`Item not found: ${receiveItem.itemId}`);
        }

        const remainingQty = poItem.quantity - poItem.receivedQuantity;
        if (receiveItem.quantityReceived > remainingQty) {
          throw new BadRequestException(
            `Cannot receive ${receiveItem.quantityReceived} units for ${poItem.productName}. Only ${remainingQty} remaining.`
          );
        }
      }

      const productIds = [...new Set(poItems.map((item) => item.productId))];
      const products = await queryRunner.manager
        .createQueryBuilder(Product, 'product')
        .where('product.id IN (:...productIds)', { productIds })
        .orderBy('product.id', 'ASC')
        .setLock('pessimistic_write')
        .getMany();
      const productMap = new Map(products.map((product) => [product.id, product]));

      const sortedReceiptItems = [...receiveDto.items].sort((a, b) =>
        a.itemId.localeCompare(b.itemId)
      );
      for (const receiveItem of sortedReceiptItems) {
        const poItem = itemMap.get(receiveItem.itemId);
        if (!poItem) throw new BadRequestException(`Item not found: ${receiveItem.itemId}`);

        poItem.receivedQuantity += receiveItem.quantityReceived;
        await queryRunner.manager.save(poItem);

        const product = productMap.get(poItem.productId);
        if (!product) {
          throw new BadRequestException(`Product not found for ${poItem.productName}`);
        }
        if (product.branchId !== po.branchId) {
          throw new BadRequestException(`Product "${product.name}" does not belong to this branch`);
        }

        const previousQty = product.quantity;
        const previousCostPrice = product.costPrice;
        const rcvQty = receiveItem.quantityReceived;
        const poUnitCost = poItem.unitCost;
        const oldCost = previousCostPrice ?? poUnitCost;

        product.costPrice =
          previousQty + rcvQty > 0
            ? (previousQty * oldCost + rcvQty * poUnitCost) / (previousQty + rcvQty)
            : poUnitCost;
        product.quantity += rcvQty;
        await queryRunner.manager.save(product);

        await this.stockAdjustmentsService.createAdjustmentWithManager(queryRunner.manager, {
          productId: product.id,
          branchId: po.branchId,
          adjustmentType: StockAdjustmentType.PROCUREMENT_RECEIPT,
          quantityChange: rcvQty,
          previousQuantity: previousQty,
          newQuantity: product.quantity,
          unitCost: poUnitCost,
          previousCostPrice,
          newCostPrice: product.costPrice,
          referenceType: 'purchase_order',
          referenceId: po.id,
          referenceCode: po.poNumber,
          staffId,
        });

        inventoryUpdates.push({
          poItemId: poItem.id,
          productId: product.id,
          productName: product.name,
          previousQuantity: previousQty,
          receivedQuantity: rcvQty,
          newQuantity: product.quantity,
          previousCostPrice,
          newCostPrice: product.costPrice,
          unitCost: poUnitCost,
        });
      }

      const allReceived = poItems.every((item) => item.receivedQuantity >= item.quantity);
      const anyReceived = poItems.some((item) => item.receivedQuantity > 0);

      if (allReceived) {
        po.status = PurchaseOrderStatus.RECEIVED;
      } else if (anyReceived) {
        po.status = PurchaseOrderStatus.PARTIALLY_RECEIVED;
      }

      await queryRunner.manager.save(po);
      await queryRunner.commitTransaction();
      poNumber = po.poNumber;
      newStatus = po.status;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.auditLogsService.logAction({
      staffId,
      action: 'RECEIVE',
      entity: 'purchaseOrder',
      entityId: id,
      description: `Received items for purchase order: ${poNumber}`,
      details: {
        poNumber,
        itemsReceived: receiveDto.items,
        inventoryUpdates,
        newStatus,
      },
    });

    return this.findOne(id, staffId);
  }

  async submitForApproval(id: string, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to submit for approval');
    }

    const po = await this.findOne(id, staffId);

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft orders can be submitted for approval');
    }

    if (po.items.length === 0) {
      throw new BadRequestException('Cannot submit empty purchase order for approval');
    }

    po.status = PurchaseOrderStatus.PENDING_APPROVAL;

    const updated = await this.poRepository.save(po);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'SUBMIT_FOR_APPROVAL',
      entity: 'purchaseOrder',
      entityId: updated.id,
      description: `Submitted purchase order for approval: ${updated.poNumber}`,
      details: { poNumber: updated.poNumber },
    });

    return this.findOne(updated.id, staffId);
  }
}
