import { Routes } from '@angular/router';
import { PermissionGuard } from '../../core/guards/permission.guard';

const reportPermissions = [
  'report.view',
  'report.sales',
  'report.expenses',
  'report.inventory',
  'report.procurement',
  'report.financial',
];

export const REPORTS_ROUTES: Routes = [
  {
    path: '',
    canActivate: [PermissionGuard],
    data: { anyPermissions: reportPermissions },
    loadComponent: () =>
      import('./pages/reports-dashboard/reports-dashboard.component').then(
        (m) => m.ReportsDashboardComponent
      ),
  },
  {
    path: 'sales',
    canActivate: [PermissionGuard],
    data: { anyPermissions: ['report.view', 'report.sales'] },
    loadComponent: () =>
      import('./pages/sales-report/sales-report.component').then((m) => m.SalesReportComponent),
  },
  {
    path: 'expenses',
    canActivate: [PermissionGuard],
    data: { anyPermissions: ['report.view', 'report.expenses'] },
    loadComponent: () =>
      import('./pages/expenses-report/expenses-report.component').then(
        (m) => m.ExpensesReportComponent
      ),
  },
  {
    path: 'inventory',
    canActivate: [PermissionGuard],
    data: { anyPermissions: ['report.view', 'report.inventory'] },
    loadComponent: () =>
      import('./pages/inventory-report/inventory-report.component').then(
        (m) => m.InventoryReportComponent
      ),
  },
  {
    path: 'procurement',
    canActivate: [PermissionGuard],
    data: { anyPermissions: ['report.view', 'report.procurement'] },
    loadComponent: () =>
      import('./pages/procurement-report/procurement-report.component').then(
        (m) => m.ProcurementReportComponent
      ),
  },
  {
    path: 'financial',
    canActivate: [PermissionGuard],
    data: { anyPermissions: ['report.view', 'report.financial'] },
    loadComponent: () =>
      import('./pages/financial-report/financial-report.component').then(
        (m) => m.FinancialReportComponent
      ),
  },
];
