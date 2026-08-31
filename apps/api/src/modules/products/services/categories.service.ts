import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from '../dtos/category.dto';
import { ScopedQueryDto } from '../dtos/scoped-query.dto';
import { StorageService } from '../../shared/services/storage.service';
import { generateSlug } from '../../../common/utils/slug.util';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { AuthUser } from '../../../common/types/auth-user.interface';
import { BranchAccessService } from '../../shared/services/branch-access.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    private readonly storageService: StorageService,
    private readonly auditLogsService: AuditLogsService,
    private readonly branchAccessService: BranchAccessService
  ) {}

  async create(
    createCategoryDto: CreateCategoryDto,
    file?: Express.Multer.File,
    authUser?: AuthUser
  ): Promise<Category> {
    if (!authUser?.staffId) {
      throw new UnauthorizedException('Staff identification required to create categories');
    }
    await this.branchAccessService.assertCanAccess(authUser.staffId, createCategoryDto.branchId);

    if (file) {
      createCategoryDto.image = await this.storageService.uploadImageFile(file, 'categories');
    }
    // Auto-generate slug from name
    const slug = generateSlug(createCategoryDto.name);
    const category = this.categoriesRepository.create({ ...createCategoryDto, slug });
    const savedCategory = await this.categoriesRepository.save(category);

    if (authUser?.staffId) {
      await this.auditLogsService.logAction({
        staffId: authUser.staffId,
        action: 'CREATE',
        entity: 'category',
        entityId: savedCategory.id,
        description: `Created category "${savedCategory.name}"`,
      });
    }

    return savedCategory;
  }

  async findAll(query: ScopedQueryDto, authUser?: AuthUser) {
    if (!authUser?.staffId) {
      throw new UnauthorizedException('Staff identification required to view categories');
    }
    await this.branchAccessService.assertCanAccess(authUser.staffId, query.branchId);

    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const qb = this.categoriesRepository.createQueryBuilder('category');

    // Branch filter
    if (query.branchId) {
      qb.andWhere('category.branchId = :branchId', { branchId: query.branchId });
    }

    // Active status filter
    if (query.isActive !== undefined) {
      const isActive = query.isActive === 'true';
      qb.andWhere('category.isActive = :isActive', { isActive });
    }

    // Search filter (name or description)
    if (query.search) {
      qb.andWhere('(category.name ILIKE :search OR category.description ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    // Ordering and pagination
    qb.orderBy('category.name', 'ASC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

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

  async findOne(id: string, authUser?: AuthUser): Promise<Category> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Category with ID ${id} not found`);
    if (authUser?.staffId) {
      await this.branchAccessService.assertCanAccess(authUser.staffId, category.branchId);
    }
    return category;
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
    file?: Express.Multer.File,
    authUser?: AuthUser
  ): Promise<Category> {
    if (!authUser?.staffId) {
      throw new UnauthorizedException('Staff identification required to update categories');
    }

    const category = await this.findOne(id, authUser);
    if (updateCategoryDto.branchId && updateCategoryDto.branchId !== category.branchId) {
      throw new BadRequestException('Cannot change a category branch');
    }
    if (file) {
      updateCategoryDto.image = await this.storageService.uploadImageFile(file, 'categories');
    }
    Object.assign(category, updateCategoryDto);
    const savedCategory = await this.categoriesRepository.save(category);

    if (authUser?.staffId) {
      await this.auditLogsService.logAction({
        staffId: authUser.staffId,
        action: 'UPDATE',
        entity: 'category',
        entityId: savedCategory.id,
        description: `Updated category "${savedCategory.name}"`,
      });
    }

    return savedCategory;
  }

  async remove(id: string, authUser?: AuthUser): Promise<void> {
    if (!authUser?.staffId) {
      throw new UnauthorizedException('Staff identification required to delete categories');
    }

    const category = await this.findOne(id, authUser);
    await this.categoriesRepository.remove(category);

    if (authUser?.staffId) {
      await this.auditLogsService.logAction({
        staffId: authUser.staffId,
        action: 'DELETE',
        entity: 'category',
        entityId: id,
        description: `Deleted category${category.name ? ` "${category.name}"` : ''}`,
      });
    }
  }
}
