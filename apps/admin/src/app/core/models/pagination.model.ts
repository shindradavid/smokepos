export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginationQuery {
  page: number;
  limit: number;
  search?: string;
  branchId?: string;
  isActive?: boolean;
}

// Extended query for products with additional filters
export interface ProductsQuery extends PaginationQuery {
  categoryId?: string;
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  minPrice?: number;
  maxPrice?: number;
}
