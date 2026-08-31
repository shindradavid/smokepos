import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { Subject, debounceTime, distinctUntilChanged, startWith, takeUntil } from 'rxjs';
import { PurchaseOrdersService } from '../../services/purchase-orders.service';
import { SuppliersService } from '../../services/suppliers.service';
import { PurchaseOrder, PurchaseOrderStatus, Supplier } from '../../models';
import { BranchService } from '../../../../core/services/branch.service';
import { ProductsService } from '../../../../core/services/products.service';
import { Product } from '../../../../core/models/product.model';
import { PaginatedResult } from '../../../../core/models/pagination.model';
import { calculatePurchaseOrderTotal } from '../../utils/purchase-order-total.util';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  price: number;
  costPrice: number | null;
}

@Component({
  selector: 'app-purchase-order-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SelectModule,
    DatePickerModule,
    TableModule,
    ToastModule,
    DialogModule,
  ],
  providers: [MessageService],
  templateUrl: './purchase-order-form.component.html',
  styleUrl: './purchase-order-form.component.scss',
})
export class PurchaseOrderFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly purchaseOrdersService = inject(PurchaseOrdersService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly productsService = inject(ProductsService);
  private readonly messageService = inject(MessageService);
  private readonly branchService = inject(BranchService);

  private readonly destroy$ = new Subject<void>();

  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly isEditMode = signal(false);
  readonly purchaseOrder = signal<PurchaseOrder | null>(null);

  // Suppliers with server-side search
  readonly suppliers = signal<Supplier[]>([]);
  readonly isLoadingSuppliers = signal(false);
  private readonly supplierSearchSubject = new Subject<string>();

  // Products with server-side search
  readonly products = signal<ProductOption[]>([]);
  readonly isLoadingProducts = signal(false);
  readonly showProductModal = signal(false);
  readonly productSearch = signal('');
  private readonly productSearchSubject = new Subject<string>();
  private selectedItemIndex: number | null = null;

  readonly canEdit = computed(() => {
    const po = this.purchaseOrder();
    if (!po) return true;
    return (
      po.status === PurchaseOrderStatus.DRAFT || po.status === PurchaseOrderStatus.PENDING_APPROVAL
    );
  });

  form: FormGroup = this.fb.group({
    supplierId: ['', Validators.required],
    expectedDeliveryDate: [null],
    notes: [''],
    items: this.fb.array([], Validators.minLength(1)),
  });

  private poId: string | null = null;

  get itemsFormArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  readonly totalAmount = signal(0);

  constructor() {
    // Setup supplier search with debounce
    this.supplierSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((search) => {
        this.loadSuppliers(search);
      });

    // Setup product search with debounce
    this.productSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((search) => {
        this.loadProducts(search);
      });

    this.itemsFormArray.valueChanges
      .pipe(startWith(this.itemsFormArray.value), takeUntil(this.destroy$))
      .subscribe((items) => this.totalAmount.set(calculatePurchaseOrderTotal(items)));
  }

  ngOnInit() {
    this.poId = this.route.snapshot.paramMap.get('id');
    this.loadSuppliers();

    if (this.poId) {
      this.isEditMode.set(true);
      this.loadPurchaseOrder(this.poId);
    } else {
      this.addItem();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadSuppliers(search: string = '') {
    const branchId = this.branchService.currentBranchId();
    if (!branchId) return;

    this.isLoadingSuppliers.set(true);
    this.suppliersService
      .getSuppliers({
        branchId,
        search: search || undefined,
        limit: 50,
        isActive: true,
      })
      .subscribe({
        next: (response) => {
          this.suppliers.set(response.data);
          this.isLoadingSuppliers.set(false);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load suppliers',
          });
          this.isLoadingSuppliers.set(false);
        },
      });
  }

  onSupplierSearch(event: { filter: string }) {
    this.supplierSearchSubject.next(event.filter);
  }

  private loadProducts(search: string = '') {
    const branchId = this.branchService.currentBranchId();

    this.isLoadingProducts.set(true);
    this.productsService
      .getProducts({
        page: 1,
        limit: 50,
        branchId: branchId || undefined,
        search: search || undefined,
        isActive: true,
      })
      .subscribe({
        next: (response: PaginatedResult<Product>) => {
          this.products.set(
            response.data.map((p: Product) => ({
              id: p.id,
              name: p.name,
              sku: p.sku || '',
              price: p.price,
              costPrice: p.costPrice,
            }))
          );
          this.isLoadingProducts.set(false);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to load products',
          });
          this.isLoadingProducts.set(false);
        },
      });
  }

  onProductSearchChange(search: string) {
    this.productSearch.set(search);
    this.productSearchSubject.next(search);
  }

  private loadPurchaseOrder(id: string) {
    this.isLoading.set(true);
    this.purchaseOrdersService.getPurchaseOrder(id).subscribe({
      next: (po) => {
        this.purchaseOrder.set(po);
        this.form.patchValue({
          supplierId: po.supplierId,
          expectedDeliveryDate: po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate) : null,
          notes: po.notes || '',
        });

        // Clear and rebuild items
        this.itemsFormArray.clear();
        po.items.forEach((item) => {
          this.itemsFormArray.push(
            this.fb.group({
              id: [item.id],
              productId: [item.productId, Validators.required],
              productName: [item.productName || ''],
              quantity: [item.quantity, [Validators.required, Validators.min(1)]],
              unitCost: [item.unitCost, [Validators.required, Validators.min(0.01)]],
            })
          );
        });

        if (!this.canEdit()) {
          this.form.disable();
        }

        this.isLoading.set(false);
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to load purchase order',
        });
        this.isLoading.set(false);
        this.router.navigate(['/procurement/purchase-orders']);
      },
    });
  }

  addItem() {
    this.itemsFormArray.push(
      this.fb.group({
        productId: ['', Validators.required],
        productName: [''],
        quantity: [1, [Validators.required, Validators.min(1)]],
        unitCost: [0, [Validators.required, Validators.min(0.01)]],
      })
    );
  }

  removeItem(index: number) {
    if (this.itemsFormArray.length > 1) {
      this.itemsFormArray.removeAt(index);
    }
  }

  openProductSelector(index: number) {
    this.selectedItemIndex = index;
    this.productSearch.set('');
    this.products.set([]);
    this.showProductModal.set(true);
    // Load initial products
    this.loadProducts();
  }

  selectProduct(product: ProductOption) {
    if (this.selectedItemIndex !== null) {
      const itemGroup = this.itemsFormArray.at(this.selectedItemIndex) as FormGroup;
      itemGroup.patchValue({
        productId: product.id,
        productName: product.name,
        unitCost: product.costPrice ?? 0,
      });
    }
    this.showProductModal.set(false);
    this.selectedItemIndex = null;
  }

  getProductName(index: number): string {
    const itemGroup = this.itemsFormArray.at(index) as FormGroup;
    const productName = itemGroup.get('productName')?.value;
    if (productName) return productName;

    const productId = itemGroup.get('productId')?.value;
    if (productId) {
      const product = this.products().find((p) => p.id === productId);
      return product?.name || '';
    }
    return '';
  }

  onProductSelect(index: number, productId: string) {
    const product = this.products().find((p) => p.id === productId);
    if (product) {
      const itemGroup = this.itemsFormArray.at(index) as FormGroup;
      itemGroup.patchValue({ unitCost: product.costPrice ?? 0 });
    }
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Validation Error',
        detail: 'Please fill all required fields and add at least one item',
      });
      return;
    }

    this.isSaving.set(true);
    const formValue = this.form.value;
    const branchId = this.branchService.currentBranchId();

    if (this.isEditMode() && this.poId) {
      this.purchaseOrdersService
        .updatePurchaseOrder(this.poId, {
          supplierId: formValue.supplierId,
          expectedDeliveryDate: formValue.expectedDeliveryDate
            ? formValue.expectedDeliveryDate.toISOString().split('T')[0]
            : undefined,
          notes: formValue.notes || undefined,
          items: formValue.items.map((item: any) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        })
        .subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Purchase order updated successfully',
            });
            this.isSaving.set(false);
            this.router.navigate(['/procurement/purchase-orders', this.poId]);
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: err.error?.message || 'Failed to update purchase order',
            });
            this.isSaving.set(false);
          },
        });
    } else {
      if (!branchId) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Please select a branch first',
        });
        this.isSaving.set(false);
        return;
      }

      this.purchaseOrdersService
        .createPurchaseOrder({
          supplierId: formValue.supplierId,
          branchId,
          expectedDeliveryDate: formValue.expectedDeliveryDate
            ? formValue.expectedDeliveryDate.toISOString().split('T')[0]
            : undefined,
          notes: formValue.notes || undefined,
          items: formValue.items.map((item: any) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        })
        .subscribe({
          next: (po) => {
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Purchase order created successfully',
            });
            this.isSaving.set(false);
            this.router.navigate(['/procurement/purchase-orders', po.id]);
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: err.error?.message || 'Failed to create purchase order',
            });
            this.isSaving.set(false);
          },
        });
    }
  }

  onCancel() {
    if (this.poId) {
      this.router.navigate(['/procurement/purchase-orders', this.poId]);
    } else {
      this.router.navigate(['/procurement/purchase-orders']);
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX' }).format(amount);
  }
}
