import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TagModule } from 'primeng/tag';

import { Customer } from '../../models/customer.model';
import { CustomersService } from '../../services/customers.service';

@Component({
  selector: 'app-customer-details',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule, ConfirmDialogModule],
  providers: [ConfirmationService],
  templateUrl: './customer-details.component.html',
  styleUrl: './customer-details.component.scss',
})
export class CustomerDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly customersService = inject(CustomersService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly customer = signal<Customer | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadCustomer(id);
  }

  loadCustomer(id: string) {
    this.isLoading.set(true);
    this.customersService.getCustomerById(id).subscribe({
      next: (customer) => {
        this.customer.set(customer);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Failed to load customer details');
        this.isLoading.set(false);
      },
    });
  }

  onEdit() {
    const customer = this.customer();
    if (customer) this.router.navigate(['/customers', customer.id, 'edit']);
  }

  onDelete() {
    const customer = this.customer();
    if (!customer) return;

    this.confirmationService.confirm({
      message: `Are you sure you want to delete customer "${customer.name}"?`,
      header: 'Delete Customer',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.customersService.deleteCustomer(customer.id).subscribe({
          next: () => this.router.navigate(['/customers']),
          error: (err) => this.error.set(err.error?.message || 'Failed to delete customer'),
        });
      },
    });
  }

  onBack() {
    this.router.navigate(['/customers']);
  }
}
