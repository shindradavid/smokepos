import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../products/entities/product.entity';
import { Category } from '../products/entities/category.entity';
import { SiteProductsQueryDto, SiteCategoriesQueryDto } from './dto';
import { Branch } from '../branches/entities/branch.entity';

// DTOs are now defined in ./dto/site-query.dto.ts

@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>
  ) {}

  /**
   * Get the main branch (isMain = true)
   */
  private async getMainBranch(): Promise<Branch | null> {
    return this.branchRepository.findOne({
      where: { isMain: true, isActive: true },
    });
  }

  /**
   * Get products for the public site (main branch only)
   */
  async getProducts(query: SiteProductsQueryDto = {}) {
    const { page = 1, limit = 20, category, search } = query;
    const skip = (page - 1) * limit;

    const mainBranch = await this.getMainBranch();
    if (!mainBranch) {
      return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.branchId = :branchId', { branchId: mainBranch.id })
      .andWhere('product.isActive = :isActive', { isActive: true });

    // Filter by category slug
    if (category) {
      qb.andWhere('category.slug = :categorySlug', { categorySlug: category });
    }

    if (search) {
      qb.andWhere('(product.name ILIKE :search OR product.sku ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('product.createdAt', 'DESC').skip(skip).take(limit);

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

  /**
   * Get categories for the public site (main branch only)
   */
  async getCategories(query: SiteCategoriesQueryDto = {}) {
    const { page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const mainBranch = await this.getMainBranch();
    if (!mainBranch) {
      return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    const [data, total] = await this.categoryRepository.findAndCount({
      where: {
        branchId: mainBranch.id,
        isActive: true,
      },
      order: { name: 'ASC' },
      skip,
      take: limit,
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

  /**
   * Get a single product by slug
   */
  async getProductBySlug(slug: string) {
    const mainBranch = await this.getMainBranch();
    if (!mainBranch) {
      return null;
    }

    return this.productRepository.findOne({
      where: {
        slug,
        branchId: mainBranch.id,
        isActive: true,
      },
      relations: ['category'],
    });
  }

  /**
   * Get a single category by slug
   */
  async getCategoryBySlug(slug: string) {
    const mainBranch = await this.getMainBranch();
    if (!mainBranch) {
      return null;
    }

    return this.categoryRepository.findOne({
      where: {
        slug,
        branchId: mainBranch.id,
        isActive: true,
      },
    });
  }
}
