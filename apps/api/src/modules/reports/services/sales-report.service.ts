import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale, SaleStatus } from '../../sales/entities/sale.entity';
import { SaleItem } from '../../sales/entities/sale-item.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { ReportQueryDto } from '../dto/report-query.dto';
import { parseReportDateRange } from '../utils/report-date-range';

export interface SalesReportData {
  summary: {
    totalRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    grossProfitMargin: number;
    totalTax: number;
    totalSales: number;
    averageOrderValue: number;
  };
  dailyTrends: {
    date: string;
    revenue: number;
    salesCount: number;
  }[];
  topProducts: {
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
    cost: number;
    profit: number;
  }[];
  salesByStatus: {
    status: string;
    count: number;
    revenue: number;
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
export class SalesReportService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepository: Repository<SaleItem>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>
  ) {}

  async getSalesReport(query: ReportQueryDto): Promise<SalesReportData> {
    const { branchId, startDate, endDate, limit = 10 } = query;

    // Validate branch exists
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const { startDateTime, endDateTime } = parseReportDateRange(startDate, endDate);

    // Get summary data
    const summaryResult = await this.saleRepository
      .createQueryBuilder('sale')
      .select('COUNT(sale.id)', 'totalSales')
      .addSelect('COALESCE(SUM(sale.total_amount), 0)', 'totalRevenue')
      .addSelect('COALESCE(SUM(sale.tax_amount), 0)', 'totalTax')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .getRawOne();

    const totalRevenue = parseFloat(summaryResult.totalRevenue) || 0;
    const totalTax = parseFloat(summaryResult.totalTax) || 0;
    const totalSales = parseInt(summaryResult.totalSales) || 0;
    const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

    // Get COGS
    const cogsResult = await this.saleItemRepository
      .createQueryBuilder('item')
      .select('COALESCE(SUM(item.unit_cost * item.quantity), 0)', 'cogs')
      .innerJoin('item.sale', 'sale')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('item.unit_cost IS NOT NULL')
      .getRawOne();

    const costOfGoodsSold = parseFloat(cogsResult.cogs) || 0;
    const grossProfit = totalRevenue - costOfGoodsSold;
    const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Get daily trends
    const dailyTrends = await this.saleRepository
      .createQueryBuilder('sale')
      .select("TO_CHAR(sale.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COALESCE(SUM(sale.total_amount), 0)', 'revenue')
      .addSelect('COUNT(sale.id)', 'salesCount')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .groupBy("TO_CHAR(sale.created_at, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    // Get top products (with cost and profit)
    const topProducts = await this.saleItemRepository
      .createQueryBuilder('item')
      .select('item.product_id', 'productId')
      .addSelect('product.name', 'productName')
      .addSelect('SUM(item.quantity)', 'quantitySold')
      .addSelect('SUM(item.quantity * item.unit_price)', 'revenue')
      .addSelect('COALESCE(SUM(item.unit_cost * item.quantity), 0)', 'cost')
      .innerJoin('item.sale', 'sale')
      .innerJoin('item.product', 'product')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .groupBy('item.product_id')
      .addGroupBy('product.name')
      .orderBy('revenue', 'DESC')
      .limit(limit)
      .getRawMany();

    // Get sales by status
    const salesByStatus = await this.saleRepository
      .createQueryBuilder('sale')
      .select('sale.status', 'status')
      .addSelect('COUNT(sale.id)', 'count')
      .addSelect('COALESCE(SUM(sale.total_amount), 0)', 'revenue')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .groupBy('sale.status')
      .getRawMany();

    return {
      summary: {
        totalRevenue,
        costOfGoodsSold,
        grossProfit,
        grossProfitMargin,
        totalTax,
        totalSales,
        averageOrderValue,
      },
      dailyTrends: dailyTrends.map((d) => ({
        date: d.date,
        revenue: parseFloat(d.revenue) || 0,
        salesCount: parseInt(d.salesCount) || 0,
      })),
      topProducts: topProducts.map((p) => {
        const revenue = parseFloat(p.revenue) || 0;
        const cost = parseFloat(p.cost) || 0;
        return {
          productId: p.productId,
          productName: p.productName,
          quantitySold: parseInt(p.quantitySold) || 0,
          revenue,
          cost,
          profit: revenue - cost,
        };
      }),
      salesByStatus: salesByStatus.map((s) => ({
        status: s.status,
        count: parseInt(s.count) || 0,
        revenue: parseFloat(s.revenue) || 0,
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
