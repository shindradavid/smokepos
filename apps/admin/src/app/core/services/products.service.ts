import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product, CreateProductDto, UpdateProductDto } from '../models/product.model';
import { PaginatedResult, ProductsQuery, PaginationQuery } from '../models/pagination.model';
import { StockAdjustment } from '../models/stock-adjustment.model';

@Injectable({
  providedIn: 'root',
})
export class ProductsService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/products`;

  getProducts(query: ProductsQuery): Observable<PaginatedResult<Product>> {
    let params = new HttpParams()
      .set('page', query.page.toString())
      .set('limit', query.limit.toString());

    if (query.search) {
      params = params.set('search', query.search);
    }
    if (query.branchId) {
      params = params.set('branchId', query.branchId);
    }
    if (query.isActive !== undefined) {
      params = params.set('isActive', query.isActive.toString());
    }
    if (query.categoryId) {
      params = params.set('categoryId', query.categoryId);
    }
    if (query.stockStatus) {
      params = params.set('stockStatus', query.stockStatus);
    }
    if (query.minPrice !== undefined) {
      params = params.set('minPrice', query.minPrice.toString());
    }
    if (query.maxPrice !== undefined) {
      params = params.set('maxPrice', query.maxPrice.toString());
    }

    return this.http.get<PaginatedResult<Product>>(this.apiUrl, { params });
  }

  getProduct(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}/${id}`);
  }

  createProduct(formData: FormData): Observable<Product> {
    return this.http.post<Product>(this.apiUrl, formData);
  }

  updateProduct(id: string, formData: FormData): Observable<Product> {
    return this.http.patch<Product>(`${this.apiUrl}/${id}`, formData);
  }

  deleteProduct(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  updateStock(
    id: string,
    quantity: number,
    reason?: string,
    costPrice?: number
  ): Observable<Product> {
    const body: any = { quantity, reason };
    if (costPrice !== undefined) {
      body.costPrice = costPrice;
    }
    return this.http.patch<Product>(`${this.apiUrl}/${id}/stock`, body);
  }

  getStockAdjustments(
    productId: string,
    query: PaginationQuery
  ): Observable<PaginatedResult<StockAdjustment>> {
    const params = new HttpParams()
      .set('page', query.page.toString())
      .set('limit', query.limit.toString());
    return this.http.get<PaginatedResult<StockAdjustment>>(
      `${this.apiUrl}/${productId}/stock-adjustments`,
      { params }
    );
  }
}
