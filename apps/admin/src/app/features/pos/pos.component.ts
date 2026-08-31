import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models/product.model';
import { BranchService } from '../../core/services/branch.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomersService } from '../customers/services/customers.service';
import { Customer } from '../customers/models/customer.model';
import { CreateSaleDto, Sale, SalesService } from '../sales/services/sales.service';
import {
  PosCartItem,
  addProductToCart,
  calculateCartSubtotal,
  calculateChange,
  setCartItemQuantity,
} from './pos-cart.utils';

type PosPaymentMethod = 'cash' | 'mobile_money' | 'card' | 'bank_transfer' | 'pay_later';

@Component({
  selector: 'app-pos',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, ToastModule, TooltipModule],
  providers: [MessageService],
  templateUrl: './pos.component.html',
  styleUrl: './pos.component.scss',
})
export class PosComponent implements OnInit, OnDestroy {
  @ViewChild('productSearch') productSearchInput?: ElementRef<HTMLInputElement>;

  private readonly productsService = inject(ProductsService);
  private readonly customersService = inject(CustomersService);
  private readonly salesService = inject(SalesService);
  readonly branchService = inject(BranchService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  private readonly destroy$ = new Subject<void>();
  private readonly productSearch$ = new Subject<string>();
  private readonly customerSearch$ = new Subject<string>();
  private activeBranchId: string | null = null;

  readonly products = signal<Product[]>([]);
  readonly cart = signal<PosCartItem[]>([]);
  readonly selectedCustomer = signal<Customer | null>(null);
  readonly customerResults = signal<Customer[]>([]);
  readonly lastSale = signal<Sale | null>(null);
  readonly canViewQuantity = computed(() =>
    this.authService.hasPermission('inventory.view_quantity')
  );
  readonly canViewSales = computed(() => this.authService.hasPermission('sale.view'));
  readonly canViewCustomers = computed(() => this.authService.hasPermission('customer.view'));

  productSearchTerm = '';
  customerSearchTerm = '';
  productsLoading = false;
  customersLoading = false;
  showCustomerDialog = false;
  readonly isSubmitting = signal(false);
  readonly paymentMethod = signal<PosPaymentMethod>('cash');
  readonly amountTendered = signal(0);

  readonly paymentOptions: { value: PosPaymentMethod; label: string; icon: string }[] = [
    { value: 'cash', label: 'Cash', icon: 'pi pi-money-bill' },
    { value: 'mobile_money', label: 'Mobile Money', icon: 'pi pi-mobile' },
    { value: 'card', label: 'Card', icon: 'pi pi-credit-card' },
    { value: 'bank_transfer', label: 'Bank', icon: 'pi pi-building-columns' },
    { value: 'pay_later', label: 'Pay Later', icon: 'pi pi-clock' },
  ];

  readonly subtotal = computed(() => calculateCartSubtotal(this.cart()));
  readonly itemCount = computed(() =>
    this.cart().reduce((total, item) => total + item.quantity, 0)
  );
  readonly paymentApplied = computed(() => {
    if (this.paymentMethod() === 'pay_later') return 0;
    return Math.min(Math.max(Number(this.amountTendered() || 0), 0), this.subtotal());
  });
  readonly changeDue = computed(() =>
    this.paymentMethod() === 'cash'
      ? calculateChange(Number(this.amountTendered() || 0), this.subtotal())
      : 0
  );
  readonly canCheckout = computed(
    () => this.cart().length > 0 && !!this.branchService.currentBranchId() && !this.isSubmitting()
  );

  constructor() {
    effect(() => {
      const branchId = this.branchService.currentBranchId();
      if (branchId && branchId !== this.activeBranchId) {
        this.activeBranchId = branchId;
        this.resetSale();
        this.loadProducts();
      }
    });
  }

  ngOnInit(): void {
    this.productSearch$
      .pipe(debounceTime(160), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadProducts());

    this.customerSearch$
      .pipe(debounceTime(180), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => this.loadCustomers());

    setTimeout(() => this.focusProductSearch());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onProductSearch(): void {
    this.productSearch$.next(this.productSearchTerm.trim());
  }

  clearProductSearch(): void {
    this.productSearchTerm = '';
    this.loadProducts();
    this.focusProductSearch();
  }

  loadProducts(): void {
    const branchId = this.branchService.currentBranchId();
    if (!branchId) return;

    this.productsLoading = true;
    this.productsService
      .getProducts({
        page: 1,
        limit: 40,
        branchId,
        search: this.productSearchTerm.trim() || undefined,
        isActive: true,
      })
      .subscribe({
        next: (response) => {
          this.products.set(response.data);
          this.productsLoading = false;
        },
        error: () => {
          this.products.set([]);
          this.productsLoading = false;
          this.showError('Could not load products');
        },
      });
  }

  addFirstSearchResult(): void {
    const firstAvailable = this.products().find((product) => product.quantity > 0);
    if (firstAvailable) this.addProduct(firstAvailable);
  }

  addProduct(product: Product): void {
    if (product.quantity < 1) {
      this.showWarning(`${product.name} is out of stock`);
      return;
    }

    const existing = this.cart().find((item) => item.product.id === product.id);
    if (existing && existing.quantity >= product.quantity) {
      this.showWarning(`Only ${product.quantity} units of ${product.name} are available`);
      return;
    }

    this.cart.set(addProductToCart(this.cart(), product));
    this.syncTenderedToTotal();
    this.focusProductSearch();
  }

  decreaseQuantity(item: PosCartItem): void {
    this.setQuantity(item.product.id, item.quantity - 1);
  }

  increaseQuantity(item: PosCartItem): void {
    if (item.quantity >= item.product.quantity) {
      this.showWarning(`Only ${item.product.quantity} units are available`);
      return;
    }
    this.setQuantity(item.product.id, item.quantity + 1);
  }

  setQuantity(productId: string, quantity: number): void {
    const item = this.cart().find((cartItem) => cartItem.product.id === productId);
    if (!item) return;

    const normalizedQuantity = Number.isFinite(quantity) ? Math.floor(quantity) : item.quantity;
    if (normalizedQuantity > item.product.quantity) {
      this.showWarning(`Only ${item.product.quantity} units are available`);
    }

    this.cart.set(setCartItemQuantity(this.cart(), productId, normalizedQuantity));
    this.syncTenderedToTotal();
  }

  removeItem(productId: string): void {
    this.cart.set(this.cart().filter((item) => item.product.id !== productId));
    this.syncTenderedToTotal();
  }

  clearCart(): void {
    if (this.cart().length === 0 || window.confirm('Clear the current sale?')) {
      this.cart.set([]);
      this.amountTendered.set(0);
      this.focusProductSearch();
    }
  }

  selectPaymentMethod(method: PosPaymentMethod): void {
    this.paymentMethod.set(method);
    this.amountTendered.set(method === 'pay_later' ? 0 : this.subtotal());
  }

  setFullPayment(): void {
    this.amountTendered.set(this.subtotal());
  }

  openCustomerPicker(): void {
    if (!this.canViewCustomers()) return;
    this.showCustomerDialog = true;
    this.customerSearchTerm = '';
    this.loadCustomers();
  }

  onCustomerSearch(): void {
    this.customerSearch$.next(this.customerSearchTerm.trim());
  }

  loadCustomers(): void {
    const branchId = this.branchService.currentBranchId() || undefined;
    this.customersLoading = true;
    this.customersService
      .getCustomers({
        page: 1,
        limit: 20,
        branchId,
        search: this.customerSearchTerm.trim() || undefined,
      })
      .subscribe({
        next: (response) => {
          this.customerResults.set(response.data);
          this.customersLoading = false;
        },
        error: () => {
          this.customerResults.set([]);
          this.customersLoading = false;
          this.showError('Could not load customers');
        },
      });
  }

  selectCustomer(customer: Customer): void {
    this.selectedCustomer.set(customer);
    this.showCustomerDialog = false;
    this.focusProductSearch();
  }

  useWalkInCustomer(): void {
    this.selectedCustomer.set(null);
    this.showCustomerDialog = false;
    this.focusProductSearch();
  }

  checkout(): void {
    if (!this.canCheckout()) return;

    const branchId = this.branchService.currentBranchId();
    if (!branchId) {
      this.showError('Select a branch before completing the sale');
      return;
    }

    const selectedCustomer = this.selectedCustomer();
    const paymentAmount = this.paymentApplied();
    if (this.paymentMethod() !== 'pay_later' && paymentAmount <= 0) {
      this.showError('Enter the amount received or choose Pay Later');
      return;
    }

    const dto: CreateSaleDto = {
      branchId,
      customerId: selectedCustomer?.id,
      customerSource: selectedCustomer ? 'returning_customer' : 'walk_in',
      items: this.cart().map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      })),
    };

    if (paymentAmount > 0 && this.paymentMethod() !== 'pay_later') {
      dto.initialPayment = {
        amount: paymentAmount,
        method: this.paymentMethod(),
        notes: 'Payment recorded at POS checkout',
      };
    }

    this.isSubmitting.set(true);
    this.salesService.createSale(dto).subscribe({
      next: (sale) => {
        this.isSubmitting.set(false);
        this.lastSale.set(sale);
        this.messageService.add({
          severity: 'success',
          summary: 'Sale completed',
          detail: `${sale.saleId} was saved successfully`,
        });
        this.resetSale(true);
        this.loadProducts();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.showError(error.error?.message || 'Could not complete the sale');
      },
    });
  }

  viewLastSale(): void {
    const sale = this.lastSale();
    if (sale && this.canViewSales()) this.router.navigate(['/sales', sale.id]);
  }

  dismissLastSale(): void {
    this.lastSale.set(null);
    this.focusProductSearch();
  }

  getProductImage(product: Product): string | null {
    return product.images?.[0] || null;
  }

  getProductInitial(product: Product): string {
    return product.name.trim().charAt(0).toUpperCase() || '?';
  }

  trackProduct(_: number, product: Product): string {
    return product.id;
  }

  trackCartItem(_: number, item: PosCartItem): string {
    return item.product.id;
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const isTyping = !!target?.closest('input, textarea, select, [contenteditable="true"]');

    if (event.key === 'F2' || (event.key === '/' && !isTyping)) {
      event.preventDefault();
      this.focusProductSearch();
    }

    if (event.key === 'F4' && !this.showCustomerDialog) {
      event.preventDefault();
      this.checkout();
    }
  }

  private resetSale(keepLastSale = false): void {
    this.cart.set([]);
    this.selectedCustomer.set(null);
    this.paymentMethod.set('cash');
    this.amountTendered.set(0);
    this.productSearchTerm = '';
    if (!keepLastSale) this.lastSale.set(null);
    setTimeout(() => this.focusProductSearch());
  }

  private syncTenderedToTotal(): void {
    this.amountTendered.set(this.paymentMethod() === 'pay_later' ? 0 : this.subtotal());
  }

  private focusProductSearch(): void {
    this.productSearchInput?.nativeElement.focus();
  }

  private showWarning(message: string): void {
    this.messageService.add({ severity: 'warn', summary: 'Check quantity', detail: message });
  }

  private showError(message: string): void {
    this.messageService.add({ severity: 'error', summary: 'POS error', detail: message });
  }
}
