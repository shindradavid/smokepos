import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../../procurement/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../../procurement/entities/purchase-order-item.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { ReportQueryDto } from '../dto/report-query.dto';
import { formatReportCalendarDate, parseReportDateRange } from '../utils/report-date-range';
import { calculateProcurementSummary } from '../utils/procurement-summary';

export interface ProcurementReportData {
  summary: {
    totalPurchaseOrders: number;
    totalAmount: number;
    pendingApprovalAmount: number;
    approvedAmount: number;
    receivedAmount: number;
    cancelledAmount: number;
  };
  byStatus: {
    status: string;
    count: number;
    amount: number;
    percentage: number;
  }[];
  bySupplier: {
    supplierId: string;
    supplierName: string;
    orderCount: number;
    totalAmount: number;
  }[];
  monthlyTrends: {
    month: string;
    count: number;
    amount: number;
  }[];
  recentOrders: {
    id: string;
    poNumber: string;
    supplierName: string;
    status: string;
    totalAmount: number;
    createdAt: string;
  }[];
  branch: {
    id: string;
    name: string;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

@Injectable()
export class ProcurementReportService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>
  ) {}

  async getProcurementReport(query: ReportQueryDto): Promise<ProcurementReportData> {
    const { branchId, startDate, endDate, limit = 10 } = query;

    // Validate branch exists
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const { startDateTime, endDateTime } = parseReportDateRange(startDate, endDate);

    // Get summary by status
    const byStatusRaw = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .select('po.status', 'status')
      .addSelect('COUNT(po.id)', 'count')
      .addSelect('COALESCE(SUM(po.total_amount), 0)', 'amount')
      .where('po.branch_id = :branchId', { branchId })
      .andWhere('po.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .groupBy('po.status')
      .getRawMany();

    const receivedResult = await this.purchaseOrderItemRepository
      .createQueryBuilder('item')
      .select('COALESCE(SUM(item.received_quantity * item.unit_cost), 0)', 'amount')
      .innerJoin('item.purchaseOrder', 'po')
      .where('po.branch_id = :branchId', { branchId })
      .andWhere('po.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('po.status != :cancelled', { cancelled: PurchaseOrderStatus.CANCELLED })
      .getRawOne();
    const summary = calculateProcurementSummary(
      byStatusRaw,
      parseFloat(receivedResult.amount) || 0
    );

    const byStatus = byStatusRaw.map((s) => {
      const amount = parseFloat(s.amount) || 0;
      return {
        status: s.status,
        count: parseInt(s.count) || 0,
        amount,
        percentage: summary.statusTotalAmount > 0 ? (amount / summary.statusTotalAmount) * 100 : 0,
      };
    });

    // Get by supplier
    const bySupplier = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .select('po.supplier_id', 'supplierId')
      .addSelect('supplier.name', 'supplierName')
      .addSelect('COUNT(po.id)', 'orderCount')
      .addSelect('COALESCE(SUM(po.total_amount), 0)', 'totalAmount')
      .innerJoin('po.supplier', 'supplier')
      .where('po.branch_id = :branchId', { branchId })
      .andWhere('po.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('po.status != :cancelled', { cancelled: PurchaseOrderStatus.CANCELLED })
      .groupBy('po.supplier_id')
      .addGroupBy('supplier.name')
      .orderBy('"totalAmount"', 'DESC')
      .limit(limit)
      .getRawMany();

    // Get monthly trends
    const monthlyTrends = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .select("TO_CHAR(po.created_at, 'YYYY-MM')", 'month')
      .addSelect('COUNT(po.id)', 'count')
      .addSelect('COALESCE(SUM(po.total_amount), 0)', 'amount')
      .where('po.branch_id = :branchId', { branchId })
      .andWhere('po.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('po.status != :cancelled', { cancelled: PurchaseOrderStatus.CANCELLED })
      .groupBy("TO_CHAR(po.created_at, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    // Get recent orders
    const recentOrders = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .select(['po.id', 'po.poNumber', 'po.status', 'po.totalAmount', 'po.createdAt'])
      .addSelect('supplier.name', 'supplierName')
      .innerJoin('po.supplier', 'supplier')
      .where('po.branch_id = :branchId', { branchId })
      .andWhere('po.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .orderBy('po.created_at', 'DESC')
      .take(limit)
      .getRawMany();

    return {
      summary: {
        totalPurchaseOrders: summary.totalPurchaseOrders,
        totalAmount: summary.totalAmount,
        pendingApprovalAmount: summary.pendingApprovalAmount,
        approvedAmount: summary.approvedAmount,
        receivedAmount: summary.receivedAmount,
        cancelledAmount: summary.cancelledAmount,
      },
      byStatus,
      bySupplier: bySupplier.map((s) => ({
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        orderCount: parseInt(s.orderCount) || 0,
        totalAmount: parseFloat(s.totalAmount) || 0,
      })),
      monthlyTrends: monthlyTrends.map((m) => ({
        month: m.month,
        count: parseInt(m.count) || 0,
        amount: parseFloat(m.amount) || 0,
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.po_id,
        poNumber: o.po_po_number,
        supplierName: o.supplierName,
        status: o.po_status,
        totalAmount: parseFloat(o.po_total_amount) || 0,
        createdAt: formatReportCalendarDate(new Date(o.po_created_at)),
      })),
      branch: {
        id: branch.id,
        name: branch.name,
      },
      dateRange: {
        startDate,
        endDate,
      },
    };
  }
}
