import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockAdjustment, StockAdjustmentType } from '../entities/stock-adjustment.entity';
import { createPaginationMeta, PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { BranchAccessService } from '../../shared/services/branch-access.service';

export interface CreateStockAdjustmentData {
  productId: string;
  branchId: string;
  adjustmentType: StockAdjustmentType;
  quantityChange: number;
  previousQuantity: number;
  newQuantity: number;
  unitCost?: number | null;
  previousCostPrice?: number | null;
  newCostPrice?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceCode?: string | null;
  reason?: string | null;
  staffId: string;
}

export class StockAdjustmentsQueryDto extends PaginationQueryDto {
  branchId?: string;
  productId?: string;
  adjustmentType?: StockAdjustmentType;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class StockAdjustmentsService {
  constructor(
    @InjectRepository(StockAdjustment)
    private readonly adjustmentRepository: Repository<StockAdjustment>,
    private readonly branchAccessService: BranchAccessService
  ) {}

  /**
   * Create a stock adjustment record. Called internally by other services.
   */
  async createAdjustment(data: CreateStockAdjustmentData): Promise<StockAdjustment> {
    const adjustment = this.adjustmentRepository.create({
      productId: data.productId,
      branchId: data.branchId,
      adjustmentType: data.adjustmentType,
      quantityChange: data.quantityChange,
      previousQuantity: data.previousQuantity,
      newQuantity: data.newQuantity,
      unitCost: data.unitCost ?? null,
      previousCostPrice: data.previousCostPrice ?? null,
      newCostPrice: data.newCostPrice ?? null,
      referenceType: data.referenceType ?? null,
      referenceId: data.referenceId ?? null,
      referenceCode: data.referenceCode ?? null,
      reason: data.reason ?? null,
      staffId: data.staffId,
    });

    return this.adjustmentRepository.save(adjustment);
  }

  /**
   * Create a stock adjustment within an existing transaction (EntityManager).
   */
  async createAdjustmentWithManager(
    manager: any,
    data: CreateStockAdjustmentData
  ): Promise<StockAdjustment> {
    const adjustment = manager.create(StockAdjustment, {
      productId: data.productId,
      branchId: data.branchId,
      adjustmentType: data.adjustmentType,
      quantityChange: data.quantityChange,
      previousQuantity: data.previousQuantity,
      newQuantity: data.newQuantity,
      unitCost: data.unitCost ?? null,
      previousCostPrice: data.previousCostPrice ?? null,
      newCostPrice: data.newCostPrice ?? null,
      referenceType: data.referenceType ?? null,
      referenceId: data.referenceId ?? null,
      referenceCode: data.referenceCode ?? null,
      reason: data.reason ?? null,
      staffId: data.staffId,
    });

    return manager.save(adjustment);
  }

  /**
   * Get stock adjustment history for a specific product (paginated).
   */
  async findByProduct(productId: string, query: PaginationQueryDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view stock history');
    }

    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);

    const qb = this.adjustmentRepository
      .createQueryBuilder('adj')
      .leftJoinAndSelect('adj.staff', 'staff')
      .leftJoinAndSelect('adj.product', 'product')
      .where('adj.productId = :productId', { productId })
      .andWhere('adj.branchId IN (:...accessibleBranchIds)', { accessibleBranchIds })
      .orderBy('adj.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: createPaginationMeta({ page, limit }, total),
    };
  }

  /**
   * Get all stock adjustments with filters (paginated).
   */
  async findAll(query: StockAdjustmentsQueryDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view stock history');
    }

    const { page = 1, limit = 20, branchId, productId, adjustmentType, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const qb = this.adjustmentRepository
      .createQueryBuilder('adj')
      .leftJoinAndSelect('adj.product', 'product')
      .leftJoinAndSelect('adj.staff', 'staff')
      .leftJoinAndSelect('adj.branch', 'branch');

    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);
    if (branchId) {
      await this.branchAccessService.assertCanAccess(staffId, branchId);
      qb.andWhere('adj.branchId = :branchId', { branchId });
    } else {
      qb.andWhere('adj.branchId IN (:...accessibleBranchIds)', { accessibleBranchIds });
    }

    if (productId) {
      qb.andWhere('adj.productId = :productId', { productId });
    }

    if (adjustmentType) {
      qb.andWhere('adj.adjustmentType = :adjustmentType', { adjustmentType });
    }

    if (startDate && endDate) {
      qb.andWhere('adj.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    }

    qb.orderBy('adj.createdAt', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: createPaginationMeta({ page, limit }, total),
    };
  }
}
