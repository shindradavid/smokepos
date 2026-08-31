import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Expense, ExpenseStatus } from './entities/expense.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesQueryDto } from './dto/expenses-query.dto';
import { ReviewExpenseDto } from './dto/review-expense.dto';
import { StorageService } from '../shared/services/storage.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { createPaginationMeta } from '../../common/dto/pagination.dto';
import { BranchAccessService } from '../shared/services/branch-access.service';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly storageService: StorageService,
    private readonly auditLogsService: AuditLogsService,
    private readonly branchAccessService: BranchAccessService
  ) {}

  /**
   * Generate human-readable expense ID: EXP-{BRANCH_SLUG}-{YYYYMM}-{SEQ}
   */
  private async generateExpenseId(branchId: string): Promise<string> {
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new BadRequestException('Invalid branch');
    }

    const branchCode = branch.slug.toUpperCase().replace(/-/g, '');
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `EXP-${branchCode}-${yearMonth}-`;

    // Find the highest sequence number for this prefix
    const lastExpense = await this.expenseRepository
      .createQueryBuilder('expense')
      .where('expense.expenseId LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('expense.expenseId', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastExpense) {
      const lastSeq = parseInt(lastExpense.expenseId.split('-').pop() || '0', 10);
      sequence = lastSeq + 1;
    }

    return `${prefix}${String(sequence).padStart(3, '0')}`;
  }

  async create(
    createExpenseDto: CreateExpenseDto,
    staffId?: string | null,
    file?: Express.Multer.File
  ) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to create expenses');
    }
    await this.branchAccessService.assertCanAccess(staffId, createExpenseDto.branchId);

    // Validate branch exists
    const branch = await this.branchRepository.findOne({
      where: { id: createExpenseDto.branchId },
    });
    if (!branch) {
      throw new BadRequestException('Invalid branch');
    }

    // Upload receipt if provided
    let receiptUrl: string | null = null;

    if (file) {
      receiptUrl = await this.storageService.uploadFile(file, 'expense-receipts');
    }

    // Generate expense ID
    const expenseId = await this.generateExpenseId(createExpenseDto.branchId);

    const expense = this.expenseRepository.create({
      ...createExpenseDto,
      expenseId,
      receiptUrl,
      createdById: staffId,
      status: ExpenseStatus.PENDING,
    });

    const savedExpense = await this.expenseRepository.save(expense);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'CREATE',
      entity: 'expense',
      entityId: savedExpense.id,
      description: `Created expense "${savedExpense.title}" for ${savedExpense.amount}`,
      details: {
        expenseId: savedExpense.expenseId,
        amount: savedExpense.amount,
        category: savedExpense.category,
        branchId: savedExpense.branchId,
      },
    });

    return this.findOne(savedExpense.id, staffId);
  }

  async findAll(query: ExpensesQueryDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view expenses');
    }

    const { page = 1, limit = 20, search, status, branchId, category, dateFrom, dateTo } = query;

    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.branch', 'branch')
      .leftJoinAndSelect('expense.createdBy', 'createdBy')
      .leftJoinAndSelect('expense.reviewedBy', 'reviewedBy')
      .leftJoinAndSelect('expense.staff', 'staff');

    // Filter by branch (required for proper access control)
    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);
    if (branchId) {
      await this.branchAccessService.assertCanAccess(staffId, branchId);
      qb.andWhere('expense.branchId = :branchId', { branchId });
    } else {
      qb.andWhere('expense.branchId IN (:...accessibleBranchIds)', { accessibleBranchIds });
    }

    // Filter by status
    if (status) {
      qb.andWhere('expense.status = :status', { status });
    }

    // Filter by category
    if (category) {
      qb.andWhere('expense.category = :category', { category });
    }

    // Filter by date range
    if (dateFrom) {
      qb.andWhere('expense.expenseDate >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('expense.expenseDate <= :dateTo', { dateTo });
    }

    // Search by title or expense ID
    if (search) {
      qb.andWhere('(expense.title ILIKE :search OR expense.expenseId ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('expense.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: createPaginationMeta(query, total),
    };
  }

  async findOne(id: string, staffId?: string | null) {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['branch', 'createdBy', 'reviewedBy', 'staff'],
    });

    if (!expense) {
      throw new NotFoundException(`Expense with ID "${id}" not found`);
    }

    if (staffId) {
      await this.branchAccessService.assertCanAccess(staffId, expense.branchId);
    }

    return expense;
  }

  async update(
    id: string,
    updateExpenseDto: UpdateExpenseDto,
    staffId?: string | null,
    file?: Express.Multer.File
  ) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to update expenses');
    }

    const expense = await this.findOne(id, staffId);

    // Check if expense can be modified
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException(
        `Cannot update expense with status "${expense.status}". Only pending expenses can be updated.`
      );
    }
    if (updateExpenseDto.branchId && updateExpenseDto.branchId !== expense.branchId) {
      throw new BadRequestException('Cannot change an expense branch');
    }

    // Upload new receipt if provided
    if (file) {
      expense.receiptUrl = await this.storageService.uploadFile(file, 'expense-receipts');
    }

    // Update fields
    Object.assign(expense, updateExpenseDto);

    const updatedExpense = await this.expenseRepository.save(expense);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'UPDATE',
      entity: 'expense',
      entityId: updatedExpense.id,
      description: `Updated expense "${updatedExpense.title}"`,
      details: {
        expenseId: updatedExpense.expenseId,
        changes: updateExpenseDto,
      },
    });

    return this.findOne(updatedExpense.id, staffId);
  }

  async remove(id: string, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to delete expenses');
    }

    const expense = await this.findOne(id, staffId);

    // Check if expense can be deleted
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException(
        `Cannot delete expense with status "${expense.status}". Only pending expenses can be deleted.`
      );
    }

    const expenseData = { ...expense };
    await this.expenseRepository.remove(expense);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'DELETE',
      entity: 'expense',
      entityId: id,
      description: `Deleted expense "${expenseData.title}"`,
      details: {
        expenseId: expenseData.expenseId,
        amount: expenseData.amount,
        category: expenseData.category,
      },
    });

    return { message: 'Expense deleted successfully' };
  }

  async review(id: string, reviewDto: ReviewExpenseDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to review expenses');
    }

    const expense = await this.findOne(id, staffId);

    // Check if expense can be reviewed
    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException(
        `Cannot review expense with status "${expense.status}". Only pending expenses can be reviewed.`
      );
    }

    // Validate rejection reason is provided for rejections
    if (reviewDto.status === ExpenseStatus.REJECTED && !reviewDto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required when rejecting an expense');
    }

    // Update expense
    expense.status = reviewDto.status;
    expense.reviewedById = staffId;
    expense.reviewedAt = new Date();

    if (reviewDto.status === ExpenseStatus.REJECTED) {
      expense.rejectionReason = reviewDto.rejectionReason || null;
    }

    const updatedExpense = await this.expenseRepository.save(expense);

    // Audit log
    const actionVerb = reviewDto.status === ExpenseStatus.APPROVED ? 'Approved' : 'Rejected';
    await this.auditLogsService.logAction({
      staffId,
      action: reviewDto.status === ExpenseStatus.APPROVED ? 'APPROVE' : 'REJECT',
      entity: 'expense',
      entityId: updatedExpense.id,
      description: `${actionVerb} expense "${updatedExpense.title}"`,
      details: {
        expenseId: updatedExpense.expenseId,
        amount: updatedExpense.amount,
        status: updatedExpense.status,
        rejectionReason: updatedExpense.rejectionReason,
      },
    });

    return this.findOne(updatedExpense.id, staffId);
  }

  /**
   * Get expense categories for dropdown
   */
  getCategories() {
    return [
      { value: 'rent', label: 'Rent' },
      { value: 'transport', label: 'Transport' },
      { value: 'salary', label: 'Salary' },
      { value: 'allowance', label: 'Allowance' },
      { value: 'utilities', label: 'Utilities' },
      { value: 'supplies', label: 'Supplies' },
      { value: 'maintenance', label: 'Maintenance' },
      { value: 'marketing', label: 'Marketing' },
      { value: 'insurance', label: 'Insurance' },
      { value: 'taxes', label: 'Taxes' },
      { value: 'equipment', label: 'Equipment' },
      { value: 'communication', label: 'Communication' },
      { value: 'travel', label: 'Travel' },
      { value: 'training', label: 'Training' },
      { value: 'miscellaneous', label: 'Miscellaneous' },
    ];
  }
}
