import { Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';

export const SALES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/sales-list/sales-list.component').then((m) => m.SalesListComponent),
    canActivate: [PermissionGuard],
    data: { permission: 'sale.view' },
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./pages/sale-form/sale-form.component').then((m) => m.SaleFormComponent),
    canActivate: [PermissionGuard],
    data: { permission: 'sale.create' },
  },
  {
    path: 'payments',
    loadComponent: () =>
      import('./pages/payment-approval/payment-approval.component').then(
        (m) => m.PaymentApprovalComponent
      ),
    canActivate: [PermissionGuard],
    data: { permission: 'sale.approve_payment' },
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/sale-details/sale-details.component').then((m) => m.SaleDetailsComponent),
    canActivate: [PermissionGuard],
    data: { permission: 'sale.view' },
  },
];
