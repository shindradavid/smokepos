import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PaginationQuery, PaginatedResult } from '../../../core/models/pagination.model';

export type CustomerSource =
  | 'walk_in'
  | 'referral'
  | 'online'
  | 'staff_support'
  | 'returning_customer'
  | 'other';

export const CUSTOMER_SOURCE_OPTIONS: { value: CustomerSource; label: string }[] = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'online', label: 'Online' },
  { value: 'staff_support', label: 'Staff Support' },
  { value: 'returning_customer', label: 'Returning Customer' },
  { value: 'other', label: 'Other' },
];

export function getCustomerSourceLabel(source: CustomerSource): string {
  const option = CUSTOMER_SOURCE_OPTIONS.find((o) => o.value === source);
  return option?.label || source;
}

export interface Sale {
  id: string;
  saleId: string;
  customer?: { id: string; name: string; email: string };
  branch?: { id: string; name: string };
  createdBy?: { id: string; firstName: string; lastName: string };
  status: 'processing' | 'delivered' | 'completed' | 'cancelled';
  customerSource?: CustomerSource;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  items: SaleItem[];
  payments: SalePayment[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleItem {
  id: string;
  product: { id: string; name: string; sku: string };
  quantity: number;
  unitPrice: number;
  unitCost: number | null;
  totalPrice: number; // Computed helper
  grossProfit: number | null; // Computed helper
}

export interface SalePayment {
  id: string;
  saleId: string;
  sale?: Sale;
  amount: number;
  method: 'cash' | 'bank_transfer' | 'mobile_money' | 'card' | 'other';
  status: 'pending' | 'confirmed' | 'denied';
  reference?: string;
  notes?: string;
  createdAt: string;
  recordedBy?: { id: string; firstName: string; lastName: string };
  approvedBy?: { id: string; firstName: string; lastName: string };
  approvedAt?: string;
}

export interface PaymentsQuery extends PaginationQuery {
  status?: 'pending' | 'confirmed' | 'denied';
  branchId?: string;
}

export interface CreateSaleDto {
  customerId?: string;
  branchId: string;
  customerSource?: CustomerSource;
  items: { productId: string; quantity: number }[];
  notes?: string;
  initialPayment?: {
    amount: number;
    method: string;
    reference?: string;
    notes?: string;
  };
}

export interface RecordPaymentDto {
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
}

export interface SalesQuery extends PaginationQuery {
  search?: string;
  status?: string;
  customerId?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SalesService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/sales`;

  getSales(query: SalesQuery): Observable<PaginatedResult<Sale>> {
    let params = new HttpParams()
      .set('page', query.page.toString())
      .set('limit', query.limit.toString());

    if (query.status) params = params.set('status', query.status);
    if (query.search) params = params.set('search', query.search);
    if (query.customerId) params = params.set('customerId', query.customerId);
    if (query.branchId) params = params.set('branchId', query.branchId);
    if (query.startDate) params = params.set('startDate', query.startDate);
    if (query.endDate) params = params.set('endDate', query.endDate);

    return this.http.get<PaginatedResult<Sale>>(this.apiUrl, { params });
  }

  getSale(id: string): Observable<Sale> {
    return this.http.get<Sale>(`${this.apiUrl}/${id}`);
  }

  createSale(data: CreateSaleDto): Observable<Sale> {
    return this.http.post<Sale>(this.apiUrl, data);
  }

  updateStatus(id: string, status: string): Observable<Sale> {
    return this.http.patch<Sale>(`${this.apiUrl}/${id}/status`, { status });
  }

  recordPayment(saleId: string, data: RecordPaymentDto): Observable<SalePayment> {
    return this.http.post<SalePayment>(`${this.apiUrl}/${saleId}/payments`, data);
  }

  approvePayment(
    paymentId: string,
    status: 'confirmed' | 'denied',
    notes?: string
  ): Observable<SalePayment> {
    return this.http.patch<SalePayment>(`${this.apiUrl}/payments/${paymentId}/approval`, {
      status,
      notes,
    });
  }

  /**
   * Get all payments with optional filters (for payment approval page)
   */
  getPayments(query: PaymentsQuery): Observable<PaginatedResult<SalePayment>> {
    let params = new HttpParams()
      .set('page', query.page.toString())
      .set('limit', query.limit.toString());

    if (query.status) params = params.set('status', query.status);
    if (query.branchId) params = params.set('branchId', query.branchId);

    return this.http.get<PaginatedResult<SalePayment>>(`${this.apiUrl}/payments`, { params });
  }

  /**
   * Download invoice PDF
   */
  downloadInvoice(saleId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${saleId}/invoice`, {
      responseType: 'blob',
    });
  }

  /**
   * Email invoice to customer
   */
  emailInvoice(saleId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/${saleId}/invoice/email`, {});
  }

  /**
   * Download payment receipt PDF
   */
  downloadReceipt(paymentId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/payments/${paymentId}/receipt`, {
      responseType: 'blob',
    });
  }

  /**
   * Email receipt to customer
   */
  emailReceipt(paymentId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/payments/${paymentId}/receipt/email`,
      {}
    );
  }
}
