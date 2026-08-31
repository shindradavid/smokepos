import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ProductsService } from '../../../../core/services/products.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Product } from '../../../../core/models/product.model';
import {
  StockAdjustment,
  StockAdjustmentTypeLabels,
} from '../../../../core/models/stock-adjustment.model';
import { PaginationMeta } from '../../../../core/models/pagination.model';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    RouterModule,
    ConfirmDialogModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    ToastModule,
    TableModule,
    TagModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './product-details.component.html',
  styleUrl: './product-details.component.scss',
})
export class ProductDetailsComponent implements OnInit {
  private productsService = inject(ProductsService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);

  product: Product | null = null;
  isDeleting = false;

  // Update Stock Modal
  showStockModal = false;
  stockQuantity: number = 0;
  stockReason: string = '';
  isUpdatingStock = false;

  // Stock History
  stockAdjustments: StockAdjustment[] = [];
  stockHistoryPagination: PaginationMeta | null = null;
  stockHistoryPage = 1;
  isLoadingStockHistory = false;
  adjustmentTypeLabels = StockAdjustmentTypeLabels;

  canViewQuantity(): boolean {
    return this.authService.hasPermission('inventory.view_quantity');
  }

  canAdjustStock(): boolean {
    return this.authService.hasPermission('inventory.adjust');
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadProduct(id);
    }
  }

  loadProduct(id: string) {
    this.productsService.getProduct(id).subscribe({
      next: (product) => {
        this.product = product;
        this.loadStockHistory(id);
      },
      error: (err) => console.error('Failed to load product details', err),
    });
  }

  loadStockHistory(productId: string, page: number = 1) {
    this.isLoadingStockHistory = true;
    this.productsService.getStockAdjustments(productId, { page, limit: 10 }).subscribe({
      next: (result) => {
        this.stockAdjustments = result.data;
        this.stockHistoryPagination = result.pagination;
        this.stockHistoryPage = page;
        this.isLoadingStockHistory = false;
      },
      error: (err) => {
        console.error('Failed to load stock history', err);
        this.isLoadingStockHistory = false;
      },
    });
  }

  onStockHistoryPageChange(event: any) {
    if (this.product) {
      const page = Math.floor(event.first / event.rows) + 1;
      this.loadStockHistory(this.product.id, page);
    }
  }

  getProfitMargin(): number | null {
    if (!this.product || this.product.costPrice === null || this.product.costPrice === undefined)
      return null;
    if (this.product.price === 0) return 0;
    return ((this.product.price - this.product.costPrice) / this.product.price) * 100;
  }

  getAdjustmentTypeLabel(type: string): string {
    return (this.adjustmentTypeLabels as Record<string, string>)[type] || type;
  }

  getAdjustmentTypeSeverity(type: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (type) {
      case 'procurement_receipt':
        return 'success';
      case 'sale':
        return 'info';
      case 'sale_cancellation':
        return 'warn';
      case 'manual':
        return 'secondary';
      default:
        return 'info';
    }
  }

  confirmDelete() {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete "${this.product?.name}"? This action cannot be undone.`,
      header: 'Delete Product',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.deleteProduct(),
    });
  }

  deleteProduct() {
    if (!this.product?.id) return;

    this.isDeleting = true;
    this.productsService.deleteProduct(this.product.id).subscribe({
      next: () => {
        this.router.navigate(['/products']);
      },
      error: (err) => {
        console.error('Failed to delete product', err);
        this.isDeleting = false;
      },
    });
  }

  // Stock Modal Methods
  openStockModal() {
    if (this.product) {
      this.stockQuantity = this.product.quantity;
      this.stockReason = '';
      this.showStockModal = true;
    }
  }

  closeStockModal() {
    this.showStockModal = false;
    this.stockReason = '';
  }

  updateStock() {
    if (!this.product?.id) return;

    this.isUpdatingStock = true;
    this.productsService
      .updateStock(this.product.id, this.stockQuantity, this.stockReason || undefined)
      .subscribe({
        next: (updatedProduct) => {
          this.product = updatedProduct;
          this.isUpdatingStock = false;
          this.closeStockModal();
          this.messageService.add({
            severity: 'success',
            summary: 'Stock Updated',
            detail: `Stock quantity updated to ${updatedProduct.quantity} units`,
          });
        },
        error: (err) => {
          console.error('Failed to update stock', err);
          this.isUpdatingStock = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: err.error?.message || 'Failed to update stock',
          });
        },
      });
  }
}
