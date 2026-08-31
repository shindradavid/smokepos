import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import {
  ItemPickerDialogComponent,
  FetchItemsFn,
} from '../../../../shared/components/item-picker-dialog/item-picker-dialog.component';
import { ProductsService } from '../../../../core/services/products.service';
import { CategoriesService } from '../../../../core/services/categories.service';
import { BranchService } from '../../../../core/services/branch.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Product } from '../../../../core/models/product.model';
import { Category } from '../../../../core/models/category.model';
import { PaginationMeta, ProductsQuery } from '../../../../core/models/pagination.model';

const DEFAULT_LIMIT = 20;

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    TableModule,
    TagModule,
    PageHeaderComponent,
    ItemPickerDialogComponent,
  ],
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.scss'],
})
export class ProductListComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly branchService = inject(BranchService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Permission checks
  readonly canViewQuantity = computed(() =>
    this.authService.hasPermission('inventory.view_quantity')
  );

  // Data state
  readonly products = signal<Product[]>([]);
  readonly pagination = signal<PaginationMeta>({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 1,
  });
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  // Filter state
  readonly searchTerm = signal('');
  readonly selectedStatus = signal<string>('');
  readonly selectedStockStatus = signal<string>('');
  readonly selectedCategory = signal<Category | null>(null);
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);

  // Modal visibility
  readonly categoryPickerVisible = signal(false);

  // Search debounce
  private searchSubject = new Subject<string>();

  // Fetch functions for pickers
  readonly fetchCategories: FetchItemsFn<Category> = (query) => {
    const branchId = this.branchService.currentBranchId() || undefined;
    return this.categoriesService.getCategories({
      page: query.page,
      limit: query.limit,
      search: query.search,
      branchId,
    });
  };

  // Computed
  readonly canGoPrev = computed(() => this.pagination().page > 1);
  readonly canGoNext = computed(() => this.pagination().page < this.pagination().totalPages);
  readonly hasActiveFilters = computed(
    () =>
      this.searchTerm() !== '' ||
      this.selectedStatus() !== '' ||
      this.selectedStockStatus() !== '' ||
      this.selectedCategory() !== null ||
      this.minPrice() !== null ||
      this.maxPrice() !== null
  );

  constructor() {
    // Debounced search
    this.searchSubject.pipe(debounceTime(400), distinctUntilChanged()).subscribe((term) => {
      this.searchTerm.set(term);
      this.loadProducts(1);
    });

    // Reload when branch changes
    effect(() => {
      this.branchService.currentBranchId();
      this.loadProducts(1);
    });
  }

  ngOnInit() {
    // Picker data is loaded on demand.
  }

  loadProducts(page: number = 1) {
    this.isLoading.set(true);
    this.error.set(null);

    const query: ProductsQuery = {
      page,
      limit: DEFAULT_LIMIT,
      branchId: this.branchService.currentBranchId() || undefined,
      search: this.searchTerm() || undefined,
      isActive: this.selectedStatus() === '' ? undefined : this.selectedStatus() === 'active',
      stockStatus: (this.selectedStockStatus() as any) || undefined,
      categoryId: this.selectedCategory()?.id || undefined,
      minPrice: this.minPrice() ?? undefined,
      maxPrice: this.maxPrice() ?? undefined,
    };

    this.productsService.getProducts(query).subscribe({
      next: (result) => {
        this.products.set(result.data);
        this.pagination.set(result.pagination);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load products');
        this.isLoading.set(false);
      },
    });
  }

  // Filter handlers
  onSearchChange(value: string) {
    this.searchSubject.next(value);
  }

  onStatusChange(status: string) {
    this.selectedStatus.set(status);
    this.loadProducts(1);
  }

  onStockStatusChange(status: string) {
    this.selectedStockStatus.set(status);
    this.loadProducts(1);
  }

  onCategorySelected(category: Category | null) {
    this.selectedCategory.set(category);
    this.loadProducts(1);
  }

  onMinPriceChange(value: number | null) {
    this.minPrice.set(value);
    this.loadProducts(1);
  }

  onMaxPriceChange(value: number | null) {
    this.maxPrice.set(value);
    this.loadProducts(1);
  }

  clearFilters() {
    this.searchTerm.set('');
    this.selectedStatus.set('');
    this.selectedStockStatus.set('');
    this.selectedCategory.set(null);
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.loadProducts(1);
  }

  // Pagination
  onPrevPage() {
    if (this.canGoPrev()) {
      this.loadProducts(this.pagination().page - 1);
    }
  }

  onNextPage() {
    if (this.canGoNext()) {
      this.loadProducts(this.pagination().page + 1);
    }
  }

  // Navigation
  onRowClick(event: any) {
    const product = event.data as Product;
    if (product && product.id) {
      this.router.navigate(['/products', product.id]);
    }
  }

  onCreate() {
    this.router.navigate(['/products', 'new']);
  }

  // Modal openers
  openCategoryPicker() {
    this.categoryPickerVisible.set(true);
  }
}
