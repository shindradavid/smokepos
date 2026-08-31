import { Component, OnInit, signal, inject, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { Router, RouterModule } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  FormArray,
  FormsModule,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { CardModule } from 'primeng/card';
import { TextareaModule } from 'primeng/textarea';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';

import { SalesService, CreateSaleDto, CUSTOMER_SOURCE_OPTIONS } from '../../services/sales.service';
import { BranchService } from '../../../../core/services/branch.service';
import { CustomersService } from '../../../customers/services/customers.service';
import { ProductsService } from '../../../../core/services/products.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { Customer } from '../../../customers/models/customer.model';
import { Product } from '../../../../core/models/product.model';
import { PaginationMeta } from '../../../../shared/models/pagination.model';

@Component({
  selector: 'app-sale-form',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    InputNumberModule,
    TableModule,
    CardModule,
    TextareaModule,
    AutoCompleteModule,
    ToastModule,
    DialogModule,
    TooltipModule,
    TooltipModule,
    InputGroupModule,
    InputGroupAddonModule,
    PageHeaderComponent,
  ],
  providers: [MessageService],
  templateUrl: './sale-form.component.html',
  styleUrl: './sale-form.component.scss',
})
export class SaleFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly salesService = inject(SalesService);
  public readonly branchService = inject(BranchService);
  private readonly customersService = inject(CustomersService);
  private readonly productsService = inject(ProductsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  // Permission checks
  readonly canViewQuantity = computed(() =>
    this.authService.hasPermission('inventory.view_quantity')
  );

  saleForm: FormGroup;
  isLoading = false;

  // Customer source options
  readonly customerSourceOptions = CUSTOMER_SOURCE_OPTIONS;

  // Selected entities for display
  selectedCustomer = signal<Customer | null>(null);

  // Customer picker modal
  showCustomerPicker = false;
  customerSearchTerm = '';
  customersLoading = false;
  filteredCustomers = signal<Customer[]>([]);
  customerPagination = signal<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  private customerSearchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  // Computed pagination controls
  readonly canGoPrevCustomer = computed(() => this.customerPagination().page > 1);
  readonly canGoNextCustomer = computed(
    () => this.customerPagination().page < this.customerPagination().totalPages
  );

  showCreateCustomerModal = false; // Standalone modal state
  isSavingCustomer = false;
  newCustomerForm: FormGroup;

  // Product picker modal
  showProductPicker = false;
  productSearchTerm = '';
  productsLoading = false;
  filteredProducts = signal<Product[]>([]);
  currentProductRowIndex: number | null = null;

  constructor() {
    this.saleForm = this.fb.group({
      customerId: [null, Validators.required],
      branchId: [null, Validators.required],
      customerSource: ['walk_in'],
      items: this.fb.array([], [Validators.required, Validators.minLength(1)]),
      notes: [''],
      // Payment fields
      addPayment: [false],
      // Payment fields enabled by default
      paymentAmount: [{ value: 0, disabled: false }, [Validators.min(0)]],
      paymentMethod: [{ value: 'cash', disabled: false }],
      paymentReference: [{ value: '', disabled: false }],
      paymentNotes: [{ value: '', disabled: false }],
    });

    this.newCustomerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      phoneNumber: ['', [Validators.required, Validators.pattern(/^[0-9+\s-]{8,}$/)]],
      email: ['', [Validators.email]],
      address: [''],
    });

    // Setup debounced customer search
    this.customerSearchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadCustomers(1);
      });
  }

  ngOnInit() {
    // Set current branch
    const currentBranch = this.branchService.currentBranch();
    if (currentBranch) {
      this.saleForm.patchValue({ branchId: currentBranch.id });
    }

    this.addItem();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get items() {
    return this.saleForm.get('items') as FormArray;
  }

  addItem() {
    const itemGroup = this.fb.group({
      product: [null, Validators.required], // Selected product object
      productId: [null, Validators.required],
      productName: [''], // Display name
      quantity: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
      unitPrice: [{ value: 0, disabled: true }], // Display only
      total: [{ value: 0, disabled: true }], // Display only
    });

    // Update totals when quantity changes
    itemGroup.get('quantity')?.valueChanges.subscribe(() => this.updateItemTotal(itemGroup));

    this.items.push(itemGroup);
  }

  removeItem(index: number) {
    this.items.removeAt(index);
  }

  updateItemTotal(group: any) {
    // Type as FormGroup generally
    const quantity = group.get('quantity')?.value || 0;
    const price = group.get('unitPrice')?.value || 0;
    group.get('total')?.setValue(quantity * price);
  }

  // Customer Picker Modal Methods
  openCustomerPicker() {
    this.showCustomerPicker = true;
    this.customerSearchTerm = '';
    this.customerPagination.set({ page: 1, limit: 10, total: 0, totalPages: 1 });
    this.loadCustomers(1); // Load initial customers
  }

  onCustomerSearchChange() {
    this.customerSearchSubject.next(this.customerSearchTerm);
  }

  clearCustomerSearch() {
    this.customerSearchTerm = '';
    this.loadCustomers(1);
  }

  loadCustomers(page: number = 1) {
    this.customersLoading = true;
    const branchId = this.branchService.currentBranchId() || undefined;

    this.customersService
      .getCustomers({
        page,
        limit: 10,
        search: this.customerSearchTerm?.trim() || undefined,
        branchId,
      })
      .subscribe({
        next: (response) => {
          this.filteredCustomers.set(response.data);
          this.customerPagination.set(response.pagination);
          this.customersLoading = false;
        },
        error: () => {
          this.filteredCustomers.set([]);
          this.customersLoading = false;
        },
      });
  }

  onPrevCustomerPage() {
    if (this.canGoPrevCustomer()) {
      this.loadCustomers(this.customerPagination().page - 1);
    }
  }

  onNextCustomerPage() {
    if (this.canGoNextCustomer()) {
      this.loadCustomers(this.customerPagination().page + 1);
    }
  }

  openCreateCustomerModal() {
    this.showCreateCustomerModal = true;
    this.newCustomerForm.reset();
  }

  closeCreateCustomerModal() {
    this.showCreateCustomerModal = false;
    this.newCustomerForm.reset();
  }

  saveNewCustomer() {
    if (this.newCustomerForm.invalid) {
      Object.keys(this.newCustomerForm.controls).forEach((key) => {
        const control = this.newCustomerForm.get(key);
        control?.markAsTouched();
        control?.markAsDirty();
      });
      return;
    }

    this.isSavingCustomer = true;
    const formVal = this.newCustomerForm.value;
    const currentBranchId = this.branchService.currentBranchId();

    this.customersService
      .createCustomer({
        name: formVal.name,
        phoneNumber: formVal.phoneNumber,
        email: formVal.email || undefined,
        address: formVal.address || undefined,
        branchId: currentBranchId || undefined,
      })
      .subscribe({
        next: (customer) => {
          this.isSavingCustomer = false;
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Customer created successfully',
          });
          this.selectCustomer(customer);
          this.closeCreateCustomerModal();
        },
        error: (err) => {
          this.isSavingCustomer = false;
          const msg = err.error?.message || 'Failed to create customer';
          this.messageService.add({ severity: 'error', summary: 'Error', detail: msg });
        },
      });
  }

  selectCustomer(customer: Customer) {
    this.selectedCustomer.set(customer);
    this.saleForm.patchValue({ customerId: customer.id });
    this.showCustomerPicker = false;
  }

  clearCustomer() {
    this.selectedCustomer.set(null);
    this.saleForm.patchValue({ customerId: null });
  }

  // Product Picker Modal Methods
  openProductPicker(rowIndex: number) {
    this.currentProductRowIndex = rowIndex;
    this.showProductPicker = true;
    this.productSearchTerm = '';
    this.filteredProducts.set([]);
    // Load initial products
    this.searchProducts();
  }

  searchProducts() {
    this.productsLoading = true;
    const branchId = this.branchService.currentBranchId();

    this.productsService
      .getProducts({
        page: 1,
        limit: 20,
        search: this.productSearchTerm?.trim() || undefined,
        branchId: branchId || undefined,
        isActive: true,
      })
      .subscribe({
        next: (response) => {
          this.filteredProducts.set(response.data);
          this.productsLoading = false;
        },
        error: () => {
          this.filteredProducts.set([]);
          this.productsLoading = false;
        },
      });
  }

  selectProduct(product: Product) {
    if (this.currentProductRowIndex === null) return;

    const isAlreadySelected = this.items.controls.some(
      (control, index) =>
        index !== this.currentProductRowIndex && control.get('productId')?.value === product.id
    );
    if (isAlreadySelected) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Product already added',
        detail: 'Change the quantity on the existing line instead.',
      });
      return;
    }

    const group = this.items.at(this.currentProductRowIndex);
    group.patchValue({
      product: product,
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
    });
    this.updateItemTotal(group);
    this.showProductPicker = false;
    this.currentProductRowIndex = null;
  }

  getProductName(index: number): string {
    const group = this.items.at(index);
    return group.get('productName')?.value || '';
  }

  calculateSubtotal(): number {
    return this.items.controls.reduce((acc, group) => {
      return acc + (group.get('total')?.value || 0);
    }, 0);
  }

  onSubmit() {
    if (this.saleForm.invalid) return;

    this.isLoading = true;
    const formValue = this.saleForm.getRawValue();

    const dto: CreateSaleDto = {
      customerId: formValue.customerId,
      branchId: formValue.branchId,
      customerSource: formValue.customerSource,
      items: formValue.items.map((item: any) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      notes: formValue.notes,
    };

    // If amount > 0, include payment
    if (formValue.paymentAmount > 0) {
      if (!formValue.paymentMethod) {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Payment method required',
        });
        this.isLoading = false;
        return;
      }
      dto.initialPayment = {
        amount: formValue.paymentAmount,
        method: formValue.paymentMethod,
        reference: formValue.paymentReference,
        notes: formValue.paymentNotes,
      };
    }

    this.salesService.createSale(dto).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Sale saved successfully',
        });
        this.router.navigate(['/sales']);
      },
      error: (err) => {
        this.isLoading = false;
        const msg = err.error?.message || 'Failed to save sale';
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: msg,
        });
      },
    });
  }
}
