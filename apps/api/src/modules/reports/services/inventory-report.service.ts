import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { calculateInventorySummary } from '../utils/inventory-summary';

export interface InventoryReportData {
  summary: {
    totalProducts: number;
    totalCostValue: number;
    totalRetailValue: number;
    lowStockCount: number;
    outOfStockCount: number;
    averageStockLevel: number;
  };
  stockByCategory: {
    categoryId: string;
    categoryName: string;
    productCount: number;
    totalQuantity: number;
    totalRetailValue: number;
    totalCostValue: number;
  }[];
  lowStockProducts: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    lowStockThreshold: number;
    price: number;
    costPrice: number | null;
    categoryName: string;
  }[];
  topValueProducts: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    price: number;
    costPrice: number | null;
    retailValue: number;
    costValue: number;
  }[];
  branch: {
    id: string;
    name: string;
  };
}

@Injectable()
export class InventoryReportService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>
  ) {}

  async getInventoryReport(branchId: string): Promise<InventoryReportData> {
    // Validate branch exists
    const branch = await this.branchRepository.findOne({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Get all products for branch
    const products = await this.productRepository.find({
      where: { branchId, isActive: true },
      relations: ['category'],
    });

    // Calculate summary
    const { totalRetailValue, totalCostValue, totalQuantity, lowStockCount, outOfStockCount } =
      calculateInventorySummary(products);

    const totalProducts = products.length;
    const averageStockLevel = totalProducts > 0 ? totalQuantity / totalProducts : 0;

    // Group by category
    const categoryMap = new Map<
      string,
      {
        categoryName: string;
        productCount: number;
        totalQuantity: number;
        totalRetailValue: number;
        totalCostValue: number;
      }
    >();

    for (const product of products) {
      const categoryId = product.categoryId || 'uncategorized';
      const categoryName = product.category?.name || 'Uncategorized';

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          categoryName,
          productCount: 0,
          totalQuantity: 0,
          totalRetailValue: 0,
          totalCostValue: 0,
        });
      }

      const cat = categoryMap.get(categoryId)!;
      cat.productCount++;
      cat.totalQuantity += product.quantity;
      cat.totalRetailValue += product.quantity * product.price;
      cat.totalCostValue += product.quantity * (product.costPrice ?? 0);
    }

    const stockByCategory = Array.from(categoryMap.entries())
      .map(([categoryId, data]) => ({
        categoryId,
        ...data,
      }))
      .sort((a, b) => b.totalRetailValue - a.totalRetailValue);

    // Get low stock products
    const lowStockProducts = products
      .filter((p) => p.quantity > 0 && p.quantity <= p.lowStockThreshold)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        quantity: p.quantity,
        lowStockThreshold: p.lowStockThreshold,
        price: p.price,
        costPrice: p.costPrice,
        categoryName: p.category?.name || 'Uncategorized',
      }));

    // Get top value products (by cost value when available, else retail)
    const topValueProducts = products
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        quantity: p.quantity,
        price: p.price,
        costPrice: p.costPrice,
        retailValue: p.quantity * p.price,
        costValue: p.quantity * (p.costPrice ?? 0),
      }))
      .sort((a, b) => b.costValue - a.costValue || b.retailValue - a.retailValue)
      .slice(0, 10);

    return {
      summary: {
        totalProducts,
        totalCostValue,
        totalRetailValue,
        lowStockCount,
        outOfStockCount,
        averageStockLevel,
      },
      stockByCategory,
      lowStockProducts,
      topValueProducts,
      branch: {
        id: branch.id,
        name: branch.name,
      },
    };
  }
}
