import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale, SaleStatus } from '../../sales/entities/sale.entity';
import { SaleItem } from '../../sales/entities/sale-item.entity';
import { Expense, ExpenseStatus } from '../../expenses/entities/expense.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Product } from '../../products/entities/product.entity';
import { ReportQueryDto } from '../dto/report-query.dto';
import { parseReportDateRange } from '../utils/report-date-range';

export interface FinancialReportData {
  summary: {
    totalRevenue: number;
    costOfGoodsSold: number;
    grossProfit: number;
    grossProfitMargin: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    totalTax: number;
    totalCostOfAvailableStock: number;
  };
  monthlyBreakdown: {
    month: string;
    revenue: number;
    expenses: number;
    cogs: number;
    profit: number;
  }[];
  dailyTrends: {
    date: string;
    revenue: number;
    expenses: number;
    cogs: number;
    profit: number;
  }[];
  revenueByCategory: {
    category: string;
    amount: number;
    percentage: number;
  }[];
  expenseByCategory: {
    category: string;
    amount: number;
    percentage: number;
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
export class FinancialReportService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepository: Repository<SaleItem>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>
  ) {}

  async getFinancialReport(query: ReportQueryDto): Promise<FinancialReportData> {
    const { branchId, startDate, endDate } = query;

    // Validate branch exists
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const { startDateTime, endDateTime } = parseReportDateRange(startDate, endDate);

    // Get total revenue (sales excluding cancelled)
    const revenueResult = await this.saleRepository
      .createQueryBuilder('sale')
      .select('COALESCE(SUM(sale.total_amount), 0)', 'totalRevenue')
      .addSelect('COALESCE(SUM(sale.tax_amount), 0)', 'totalTax')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .getRawOne();

    const totalRevenue = parseFloat(revenueResult.totalRevenue) || 0;
    const totalTax = parseFloat(revenueResult.totalTax) || 0;

    // Get total expenses (approved only)
    const expenseResult = await this.expenseRepository
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.amount), 0)', 'totalExpenses')
      .where('expense.branch_id = :branchId', { branchId })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('expense.status = :approved', { approved: ExpenseStatus.APPROVED })
      .getRawOne();

    // Get COGS (Cost of Goods Sold) from sale items with cost data
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

    const totalExpenses = parseFloat(expenseResult.totalExpenses) || 0;

    // Calculate total cost of available stock (inventory buying cost)
    const stockCostResult = await this.productRepository
      .createQueryBuilder('product')
      .select('COALESCE(SUM(product.cost_price * product.quantity), 0)', 'total')
      .where('product.branch_id = :branchId', { branchId })
      .andWhere('product.is_active = :isActive', { isActive: true })
      .andWhere('product.quantity > 0')
      .andWhere('product.cost_price IS NOT NULL')
      .getRawOne();
    const totalCostOfAvailableStock = parseFloat(stockCostResult?.total) || 0;
    const netProfit = grossProfit - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Get monthly breakdown
    const monthlyRevenue = await this.saleRepository
      .createQueryBuilder('sale')
      .select("TO_CHAR(sale.created_at, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(sale.total_amount), 0)', 'revenue')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .groupBy("TO_CHAR(sale.created_at, 'YYYY-MM')")
      .getRawMany();

    const monthlyExpenses = await this.expenseRepository
      .createQueryBuilder('expense')
      .select("TO_CHAR(expense.expense_date, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'expenses')
      .where('expense.branch_id = :branchId', { branchId })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('expense.status = :approved', { approved: ExpenseStatus.APPROVED })
      .groupBy("TO_CHAR(expense.expense_date, 'YYYY-MM')")
      .getRawMany();

    // Get monthly COGS
    const monthlyCOGS = await this.saleItemRepository
      .createQueryBuilder('item')
      .select("TO_CHAR(sale.created_at, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(item.unit_cost * item.quantity), 0)', 'cogs')
      .innerJoin('item.sale', 'sale')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('item.unit_cost IS NOT NULL')
      .groupBy("TO_CHAR(sale.created_at, 'YYYY-MM')")
      .getRawMany();

    // Combine monthly data
    const monthlyMap = new Map<string, { revenue: number; expenses: number; cogs: number }>();
    for (const r of monthlyRevenue) {
      monthlyMap.set(r.month, { revenue: parseFloat(r.revenue) || 0, expenses: 0, cogs: 0 });
    }
    for (const e of monthlyExpenses) {
      const existing = monthlyMap.get(e.month) || { revenue: 0, expenses: 0, cogs: 0 };
      existing.expenses = parseFloat(e.expenses) || 0;
      monthlyMap.set(e.month, existing);
    }
    for (const c of monthlyCOGS) {
      const existing = monthlyMap.get(c.month) || { revenue: 0, expenses: 0, cogs: 0 };
      existing.cogs = parseFloat(c.cogs) || 0;
      monthlyMap.set(c.month, existing);
    }

    const monthlyBreakdown = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        expenses: data.expenses,
        cogs: data.cogs,
        profit: data.revenue - data.cogs - data.expenses,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Get daily trends
    const dailyRevenue = await this.saleRepository
      .createQueryBuilder('sale')
      .select("TO_CHAR(sale.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COALESCE(SUM(sale.total_amount), 0)', 'revenue')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .groupBy("TO_CHAR(sale.created_at, 'YYYY-MM-DD')")
      .getRawMany();

    const dailyExpenses = await this.expenseRepository
      .createQueryBuilder('expense')
      .select("TO_CHAR(expense.expense_date, 'YYYY-MM-DD')", 'date')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'expenses')
      .where('expense.branch_id = :branchId', { branchId })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('expense.status = :approved', { approved: ExpenseStatus.APPROVED })
      .groupBy("TO_CHAR(expense.expense_date, 'YYYY-MM-DD')")
      .getRawMany();

    // Get daily COGS
    const dailyCOGS = await this.saleItemRepository
      .createQueryBuilder('item')
      .select("TO_CHAR(sale.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COALESCE(SUM(item.unit_cost * item.quantity), 0)', 'cogs')
      .innerJoin('item.sale', 'sale')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .andWhere('item.unit_cost IS NOT NULL')
      .groupBy("TO_CHAR(sale.created_at, 'YYYY-MM-DD')")
      .getRawMany();

    // Combine daily data
    const dailyMap = new Map<string, { revenue: number; expenses: number; cogs: number }>();
    for (const r of dailyRevenue) {
      dailyMap.set(r.date, { revenue: parseFloat(r.revenue) || 0, expenses: 0, cogs: 0 });
    }
    for (const e of dailyExpenses) {
      const existing = dailyMap.get(e.date) || { revenue: 0, expenses: 0, cogs: 0 };
      existing.expenses = parseFloat(e.expenses) || 0;
      dailyMap.set(e.date, existing);
    }
    for (const c of dailyCOGS) {
      const existing = dailyMap.get(c.date) || { revenue: 0, expenses: 0, cogs: 0 };
      existing.cogs = parseFloat(c.cogs) || 0;
      dailyMap.set(c.date, existing);
    }

    const dailyTrends = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        expenses: data.expenses,
        cogs: data.cogs,
        profit: data.revenue - data.cogs - data.expenses,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get expense by category
    const expenseByCategory = await this.expenseRepository
      .createQueryBuilder('expense')
      .select('expense.category', 'category')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'amount')
      .where('expense.branch_id = :branchId', { branchId })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('expense.status = :approved', { approved: ExpenseStatus.APPROVED })
      .groupBy('expense.category')
      .orderBy('amount', 'DESC')
      .getRawMany();

    const revenueByCategory = await this.saleItemRepository
      .createQueryBuilder('item')
      .select("COALESCE(category.name, 'Uncategorized')", 'category')
      .addSelect('COALESCE(SUM(item.quantity * item.unit_price), 0)', 'amount')
      .innerJoin('item.sale', 'sale')
      .innerJoin('item.product', 'product')
      .leftJoin('product.category', 'category')
      .where('sale.branch_id = :branchId', { branchId })
      .andWhere('sale.created_at BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('sale.status != :cancelled', { cancelled: SaleStatus.CANCELLED })
      .groupBy("COALESCE(category.name, 'Uncategorized')")
      .orderBy('amount', 'DESC')
      .getRawMany();

    return {
      summary: {
        totalRevenue,
        costOfGoodsSold,
        grossProfit,
        grossProfitMargin,
        totalExpenses,
        netProfit,
        profitMargin,
        totalTax,
        totalCostOfAvailableStock,
      },
      monthlyBreakdown,
      dailyTrends,
      revenueByCategory: revenueByCategory.map((entry) => {
        const amount = parseFloat(entry.amount) || 0;
        return {
          category: entry.category,
          amount,
          percentage: totalRevenue > 0 ? (amount / totalRevenue) * 100 : 0,
        };
      }),
      expenseByCategory: expenseByCategory.map((e) => {
        const amount = parseFloat(e.amount) || 0;
        return {
          category: e.category,
          amount,
          percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
        };
      }),
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
