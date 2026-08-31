import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Customer } from '../entities/customer.entity';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { BranchAccessService } from '../../shared/services/branch-access.service';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly branchAccessService: BranchAccessService
  ) {}

  async create(
    createCustomerDto: CreateCustomerDto,
    branchId?: string,
    staffId?: string | null
  ): Promise<Customer> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to create customers');
    }
    const customerBranchId = createCustomerDto.branchId || branchId;
    if (!customerBranchId) {
      throw new BadRequestException('Branch is required');
    }
    await this.branchAccessService.assertCanAccess(staffId, customerBranchId);

    const customer = this.customerRepository.create({
      ...createCustomerDto,
      branchId: customerBranchId,
      userAccountId: null, // Admin-created customers don't have user accounts
    });
    return this.customerRepository.save(customer);
  }

  /**
   * Search customers by name, email, or phone number
   * Returns top N matches for autocomplete
   * Optionally filter by branch
   */
  async search(
    query: string,
    limit: number = 10,
    branchId?: string,
    staffId?: string | null
  ): Promise<Customer[]> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view customers');
    }
    if (branchId) {
      await this.branchAccessService.assertCanAccess(staffId, branchId);
    }
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = `%${query.trim()}%`;
    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);

    const qb = this.customerRepository
      .createQueryBuilder('customer')
      .where(
        '(customer.name ILIKE :search OR customer.email ILIKE :search OR customer.phoneNumber ILIKE :search)',
        { search: searchTerm }
      );

    // Filter by branch if provided
    if (branchId) {
      qb.andWhere('(customer.branchId = :branchId OR customer.branchId IS NULL)', { branchId });
    } else {
      qb.andWhere('(customer.branchId IN (:...accessibleBranchIds) OR customer.branchId IS NULL)', {
        accessibleBranchIds,
      });
    }

    return qb.orderBy('customer.name', 'ASC').limit(limit).getMany();
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    branchId?: string,
    staffId?: string | null,
    search?: string
  ) {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to view customers');
    }

    const skip = (page - 1) * limit;
    const accessibleBranchIds = await this.branchAccessService.getAccessibleBranchIds(staffId);
    const qb = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.branch', 'branch');

    if (branchId) {
      await this.branchAccessService.assertCanAccess(staffId, branchId);
      qb.andWhere('customer.branchId = :branchId', { branchId });
    } else {
      qb.andWhere('customer.branchId IN (:...accessibleBranchIds)', { accessibleBranchIds });
    }
    if (search?.trim()) {
      qb.andWhere(
        '(customer.name ILIKE :search OR customer.email ILIKE :search OR customer.phoneNumber ILIKE :search)',
        { search: `%${search.trim()}%` }
      );
    }

    qb.orderBy('customer.createdAt', 'DESC').skip(skip).take(limit);
    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string, staffId?: string | null): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: ['user', 'branch'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID "${id}" not found`);
    }

    if (staffId && customer.branchId) {
      await this.branchAccessService.assertCanAccess(staffId, customer.branchId);
    }

    return customer;
  }

  async findByUserId(userId: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { userAccountId: userId },
    });

    if (!customer) {
      throw new NotFoundException(`Customer profile not found for user "${userId}"`);
    }

    return customer;
  }

  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
    staffId?: string | null
  ): Promise<Customer> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to update customers');
    }
    const customer = await this.findOne(id, staffId);
    if (updateCustomerDto.branchId) {
      await this.branchAccessService.assertCanAccess(staffId, updateCustomerDto.branchId);
    }
    Object.assign(customer, updateCustomerDto);
    return this.customerRepository.save(customer);
  }

  async remove(id: string, staffId?: string | null): Promise<void> {
    if (!staffId) {
      throw new UnauthorizedException('Staff identification required to delete customers');
    }
    const customer = await this.findOne(id, staffId);
    await this.customerRepository.remove(customer);
  }
}
