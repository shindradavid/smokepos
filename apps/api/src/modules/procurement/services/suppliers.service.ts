import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { Supplier } from '../entities/supplier.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { CreateSupplierDto, UpdateSupplierDto, SuppliersQueryDto } from '../dto';
import { createPaginationMeta } from '../../../common/dto/pagination.dto';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { BranchAccessService } from '../../shared/services/branch-access.service';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly auditLogsService: AuditLogsService,
    private readonly branchAccessService: BranchAccessService
  ) {}

  /**
   * Generate supplier code: SUP-{BRANCH_SLUG}-{SEQ}
   */
  private async generateSupplierCode(branchId: string): Promise<string> {
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new BadRequestException('Invalid branch');
    }

    const branchCode = branch.slug.toUpperCase().replace(/-/g, '');
    const prefix = `SUP-${branchCode}-`;

    // Find the highest sequence number for this prefix
    const lastSupplier = await this.supplierRepository
      .createQueryBuilder('supplier')
      .where('supplier.code LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('supplier.code', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastSupplier) {
      const lastSeq = parseInt(lastSupplier.code.split('-').pop() || '0', 10);
      sequence = lastSeq + 1;
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  async create(createSupplierDto: CreateSupplierDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to create suppliers');
    }
    await this.branchAccessService.assertCanAccess(staffId, createSupplierDto.branchId);

    // Validate branch exists
    const branch = await this.branchRepository.findOne({
      where: { id: createSupplierDto.branchId },
    });
    if (!branch) {
      throw new BadRequestException('Invalid branch');
    }

    // Generate supplier code
    const code = await this.generateSupplierCode(createSupplierDto.branchId);

    const supplier = this.supplierRepository.create({
      ...createSupplierDto,
      code,
    });

    const saved = await this.supplierRepository.save(supplier);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'CREATE',
      entity: 'supplier',
      entityId: saved.id,
      description: `Created supplier: ${saved.name} (${saved.code})`,
      details: { name: saved.name, code: saved.code, branchId: saved.branchId },
    });

    return saved;
  }

  async findAll(query: SuppliersQueryDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view suppliers');
    }

    const { page = 1, limit = 20, branchId, isActive, search } = query;
    const skip = (page - 1) * limit;

    const whereConditions: any = {};

    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);
    if (branchId) {
      await this.branchAccessService.assertCanAccess(staffId, branchId);
      whereConditions.branchId = branchId;
    } else {
      whereConditions.branchId = In(accessibleBranchIds);
    }

    if (isActive !== undefined) {
      whereConditions.isActive = isActive;
    }

    if (search) {
      whereConditions.name = ILike(`%${search}%`);
    }

    const [data, total] = await this.supplierRepository.findAndCount({
      where: whereConditions,
      relations: ['branch'],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      pagination: createPaginationMeta({ page, limit }, total),
    };
  }

  async findOne(id: string, staffId?: string | null) {
    const supplier = await this.supplierRepository.findOne({
      where: { id },
      relations: ['branch'],
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (staffId) {
      await this.branchAccessService.assertCanAccess(staffId, supplier.branchId);
    }

    return supplier;
  }

  async update(id: string, updateSupplierDto: UpdateSupplierDto, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to update suppliers');
    }

    const supplier = await this.findOne(id, staffId);

    // Don't allow changing branch
    if (updateSupplierDto.branchId && updateSupplierDto.branchId !== supplier.branchId) {
      throw new BadRequestException('Cannot change supplier branch');
    }

    Object.assign(supplier, updateSupplierDto);
    const updated = await this.supplierRepository.save(supplier);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'UPDATE',
      entity: 'supplier',
      entityId: updated.id,
      description: `Updated supplier: ${updated.name} (${updated.code})`,
      details: updateSupplierDto,
    });

    return updated;
  }

  async remove(id: string, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to delete suppliers');
    }

    const supplier = await this.findOne(id, staffId);

    await this.supplierRepository.remove(supplier);

    // Audit log
    await this.auditLogsService.logAction({
      staffId,
      action: 'DELETE',
      entity: 'supplier',
      entityId: id,
      description: `Deleted supplier: ${supplier.name} (${supplier.code})`,
      details: { name: supplier.name, code: supplier.code },
    });

    return { message: 'Supplier deleted successfully' };
  }

  async findByBranch(branchId: string, staffId?: string | null) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view suppliers');
    }
    await this.branchAccessService.assertCanAccess(staffId, branchId);

    return this.supplierRepository.find({
      where: { branchId, isActive: true },
      order: { name: 'ASC' },
    });
  }
}
