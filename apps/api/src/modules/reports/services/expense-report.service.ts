import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense, ExpenseStatus } from '../../expenses/entities/expense.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { ReportQueryDto } from '../dto/report-query.dto';
import { formatReportCalendarDate, parseReportDateRange } from '../utils/report-date-range';

export interface ExpenseReportData {
  summary: {
    totalExpenses: number;
    approvedExpenses: number;
    pendingExpenses: number;
    rejectedExpenses: number;
    expenseCount: number;
  };
  byCategory: {
    category: string;
    amount: number;
    count: number;
    percentage: number;
  }[];
  byStatus: {
    status: string;
    amount: number;
    count: number;
  }[];
  dailyTrends: {
    date: string;
    amount: number;
    count: number;
  }[];
  topExpenses: {
    id: string;
    expenseId: string;
    title: string;
    category: string;
    amount: number;
    expenseDate: string;
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
export class ExpenseReportService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>
  ) {}

  async getExpenseReport(query: ReportQueryDto): Promise<ExpenseReportData> {
    const { branchId, startDate, endDate, limit = 10 } = query;

    // Validate branch exists
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const { startDateTime, endDateTime } = parseReportDateRange(startDate, endDate);

    // Get summary data
    const allExpenses = await this.expenseRepository
      .createQueryBuilder('expense')
      .select('expense.status', 'status')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'amount')
      .addSelect('COUNT(expense.id)', 'count')
      .where('expense.branch_id = :branchId', { branchId })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .groupBy('expense.status')
      .getRawMany();

    let totalExpenses = 0;
    let approvedExpenses = 0;
    let pendingExpenses = 0;
    let rejectedExpenses = 0;
    let expenseCount = 0;

    for (const exp of allExpenses) {
      const amount = parseFloat(exp.amount) || 0;
      const count = parseInt(exp.count) || 0;
      totalExpenses += amount;
      expenseCount += count;

      if (exp.status === ExpenseStatus.APPROVED) {
        approvedExpenses = amount;
      } else if (exp.status === ExpenseStatus.PENDING) {
        pendingExpenses = amount;
      } else if (exp.status === ExpenseStatus.REJECTED) {
        rejectedExpenses = amount;
      }
    }

    // Get expenses by category (only approved)
    const byCategory = await this.expenseRepository
      .createQueryBuilder('expense')
      .select('expense.category', 'category')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'amount')
      .addSelect('COUNT(expense.id)', 'count')
      .where('expense.branch_id = :branchId', { branchId })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('expense.status = :approved', { approved: ExpenseStatus.APPROVED })
      .groupBy('expense.category')
      .orderBy('amount', 'DESC')
      .getRawMany();

    // Calculate percentages
    const categoryData = byCategory.map((c) => {
      const amount = parseFloat(c.amount) || 0;
      return {
        category: c.category,
        amount,
        count: parseInt(c.count) || 0,
        percentage: approvedExpenses > 0 ? (amount / approvedExpenses) * 100 : 0,
      };
    });

    // Get expenses by status
    const byStatus = allExpenses.map((s) => ({
      status: s.status,
      amount: parseFloat(s.amount) || 0,
      count: parseInt(s.count) || 0,
    }));

    // Get daily trends (approved only)
    const dailyTrends = await this.expenseRepository
      .createQueryBuilder('expense')
      .select("TO_CHAR(expense.expense_date, 'YYYY-MM-DD')", 'date')
      .addSelect('COALESCE(SUM(expense.amount), 0)', 'amount')
      .addSelect('COUNT(expense.id)', 'count')
      .where('expense.branch_id = :branchId', { branchId })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('expense.status = :approved', { approved: ExpenseStatus.APPROVED })
      .groupBy("TO_CHAR(expense.expense_date, 'YYYY-MM-DD')")
      .orderBy('date', 'ASC')
      .getRawMany();

    // Get top expenses (approved)
    const topExpenses = await this.expenseRepository
      .createQueryBuilder('expense')
      .select([
        'expense.id',
        'expense.expenseId',
        'expense.title',
        'expense.category',
        'expense.amount',
        'expense.expenseDate',
      ])
      .where('expense.branch_id = :branchId', { branchId })
      .andWhere('expense.expense_date BETWEEN :startDate AND :endDate', {
        startDate: startDateTime,
        endDate: endDateTime,
      })
      .andWhere('expense.status = :approved', { approved: ExpenseStatus.APPROVED })
      .orderBy('expense.amount', 'DESC')
      .take(limit)
      .getMany();

    return {
      summary: {
        totalExpenses,
        approvedExpenses,
        pendingExpenses,
        rejectedExpenses,
        expenseCount,
      },
      byCategory: categoryData,
      byStatus,
      dailyTrends: dailyTrends.map((d) => ({
        date: d.date,
        amount: parseFloat(d.amount) || 0,
        count: parseInt(d.count) || 0,
      })),
      topExpenses: topExpenses.map((e) => ({
        id: e.id,
        expenseId: e.expenseId,
        title: e.title,
        category: e.category,
        amount: e.amount,
        expenseDate:
          e.expenseDate instanceof Date
            ? formatReportCalendarDate(e.expenseDate)
            : String(e.expenseDate).split('T')[0],
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
