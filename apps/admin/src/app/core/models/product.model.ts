import { Category } from './category.model';

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  images?: string[];
  categoryId?: string;
  category?: Category;
  branchId: string;
  price: number;
  costPrice: number | null;
  isActive: boolean;
  quantity: number;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductDto {
  name: string;
  description?: string;
  sku?: string;
  images?: string[];
  categoryId?: string;
  branchId: string;
  price: number;
  costPrice?: number;
  isActive?: boolean;
  quantity?: number;
  lowStockThreshold?: number;
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}
