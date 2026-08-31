import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { BranchService } from '../../../../core/services/branch.service';
import { AuthService } from '../../../../core/services/auth.service';

interface ReportCard {
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
  permission: string;
}

@Component({
  selector: 'app-reports-dashboard',
  standalone: true,
  imports: [CommonModule, CardModule, ButtonModule],
  templateUrl: './reports-dashboard.component.html',
  styleUrl: './reports-dashboard.component.scss',
})
export class ReportsDashboardComponent {
  private readonly router = inject(Router);
  private readonly branchService = inject(BranchService);
  private readonly authService = inject(AuthService);

  readonly currentBranchName = this.branchService.currentBranchName;

  readonly reportCards: ReportCard[] = [
    {
      title: 'Sales Report',
      description: 'View revenue trends, top products, and sales analytics for your branch.',
      icon: 'pi pi-chart-line',
      route: '/reports/sales',
      color: '#009688',
      permission: 'report.sales',
    },
    {
      title: 'Expense Report',
      description: 'Analyze expenses by category, track spending patterns and budgets.',
      icon: 'pi pi-wallet',
      route: '/reports/expenses',
      color: '#FFB300',
      permission: 'report.expenses',
    },
    {
      title: 'Inventory Report',
      description: 'Monitor stock levels, low stock alerts, and product valuations.',
      icon: 'pi pi-box',
      route: '/reports/inventory',
      color: '#009688',
      permission: 'report.inventory',
    },
    {
      title: 'Procurement Report',
      description: 'Track purchase orders, supplier performance, and procurement trends.',
      icon: 'pi pi-truck',
      route: '/reports/procurement',
      color: '#263238',
      permission: 'report.procurement',
    },
    {
      title: 'Financial Report',
      description: 'View profit & loss, revenue vs expenses, and overall financial health.',
      icon: 'pi pi-dollar',
      route: '/reports/financial',
      color: '#FFB300',
      permission: 'report.financial',
    },
  ];

  readonly visibleReportCards = this.reportCards.filter(
    (card) =>
      this.authService.hasPermission('report.view') ||
      this.authService.hasPermission(card.permission)
  );

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
}
