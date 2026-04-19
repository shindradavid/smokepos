import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { StatsCardComponent } from '../../../../shared/components/stats-card/stats-card.component';
import { DashboardService } from '../../../../core/services/dashboard.service';
import { AuthService } from '../../../../core/services/auth.service';
import { BranchService } from '../../../../core/services/branch.service';
import { SidebarBadgeService } from '../../../../core/services/sidebar-badge.service';
import { DashboardStats } from '../../../../core/models/dashboard.model';
import { formatCurrency } from '../../../../shared/utils/currency.util';
import { MessagesService } from '../../../messages/services/messages.service';
import { AdminMessage } from '../../../messages/models/message.model';

interface StatCard {
  title: string;
  value: string | number;
  subtitle: string;
  icon: string;
  iconBgColor: string;
  iconColor: string;
  route?: string;
  highlighted?: boolean;
}

interface QuickAction {
  icon: string;
  label: string;
  route: string;
  permission: string;
  color: string;
  bgColor: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, StatsCardComponent, ButtonModule, ChartModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly authService = inject(AuthService);
  readonly branchService = inject(BranchService);
  private readonly router = inject(Router);
  private readonly messagesService = inject(MessagesService);
  readonly badgeService = inject(SidebarBadgeService);

  readonly dashboardStats = signal<DashboardStats | null>(null);
  readonly statsLoading = signal(false);
  readonly recentMessages = signal<AdminMessage[]>([]);
  readonly messagesLoading = signal(false);

  constructor() {
    // Reload stats when branch changes
    effect(() => {
      const branchId = this.branchService.currentBranchId();
      if (branchId) {
        this.loadDashboardStats();
      }
    });

    effect(() => {
      const unreadCount = this.badgeService.getBadgeCount('messages');
      if (this.canViewMessages()) {
        void unreadCount;
        this.loadRecentMessages();
      }
    });
  }

  // Permission checks for dashboard sections
  readonly canViewSales = computed(() => this.authService.hasPermission('dashboard.sales'));

  readonly canViewExpenses = computed(() => this.authService.hasPermission('dashboard.expenses'));

  readonly canViewInventory = computed(() => this.authService.hasPermission('dashboard.inventory'));

  readonly canViewFinancial = computed(() => this.authService.hasPermission('dashboard.financial'));

  readonly canViewMessages = computed(
    () => this.authService.hasPermission('message.view') || this.authService.hasPermission('message.read')
  );

  // Expose formatCurrency to template
  readonly formatCurrency = formatCurrency;

  readonly stats = computed(() => {
    const allStats: StatCard[] = [];
    const data = this.dashboardStats();

    // Sales stat - requires dashboard.sales permission
    if (this.canViewSales() && data) {
      allStats.push({
        title: 'Total Sales (Today)',
        value: formatCurrency(data.totalSalesToday),
        subtitle: 'Sales recorded today',
        icon: 'pi pi-chart-line',
        iconBgColor: '#dcfce7',
        iconColor: '#22c55e',
      });
    }

    // Expenses stat - requires dashboard.expenses permission
    if (this.canViewExpenses() && data) {
      allStats.push({
        title: 'Total Expenses (Month)',
        value: formatCurrency(data.totalExpensesMonth),
        subtitle: 'This month',
        icon: 'pi pi-exclamation-circle',
        iconBgColor: '#fee2e2',
        iconColor: '#ef4444',
      });
    }

    // Inventory stats - requires dashboard.inventory permission
    if (this.canViewInventory() && data) {
      allStats.push({
        title: 'Available Stock Value',
        value: formatCurrency(data.availableStockValue),
        subtitle: 'Current inventory value',
        icon: 'pi pi-box',
        iconBgColor: '#dbeafe',
        iconColor: '#3b82f6',
      });

      allStats.push({
        title: 'Total Cost of Available Stock',
        value: formatCurrency(data.totalCostOfAvailableStock),
        subtitle: 'Inventory buying cost',
        icon: 'pi pi-warehouse',
        iconBgColor: '#f3e8ff',
        iconColor: '#8b5cf6',
      });
    }

    // Financial metrics - requires dashboard.financial permission
    if (this.canViewFinancial() && data) {
      allStats.push({
        title: 'Gross Profit (Month)',
        value: formatCurrency(data.grossProfitMonth),
        subtitle: 'Revenue minus COGS',
        icon: 'pi pi-arrow-up-right',
        iconBgColor: '#dcfce7',
        iconColor: '#16a34a',
        highlighted: data.grossProfitMonth < 0,
      });

      allStats.push({
        title: 'Net Profit (Month)',
        value: formatCurrency(data.netProfitMonth),
        subtitle: 'Revenue minus COGS minus expenses',
        icon: 'pi pi-wallet',
        iconBgColor: data.netProfitMonth >= 0 ? '#dcfce7' : '#fee2e2',
        iconColor: data.netProfitMonth >= 0 ? '#16a34a' : '#ef4444',
        highlighted: data.netProfitMonth < 0,
      });

      allStats.push({
        title: 'Gross Profit Margin',
        value: `${data.grossProfitMarginMonth.toFixed(1)}%`,
        subtitle: 'This month',
        icon: 'pi pi-percentage',
        iconBgColor: '#dbeafe',
        iconColor: '#3b82f6',
      });

      allStats.push({
        title: 'Net Profit Margin',
        value: `${data.netProfitMarginMonth.toFixed(1)}%`,
        subtitle: 'This month',
        icon: 'pi pi-percentage',
        iconBgColor: '#fef3c7',
        iconColor: '#f59e0b',
      });
    }

    return allStats;
  });

  // Inventory Health Chart Data (Doughnut/Pie chart)
  readonly inventoryChartData = computed(() => {
    const data = this.dashboardStats();
    if (!data?.inventoryHealth?.length) {
      return null;
    }

    const colors = [
      '#3b82f6', // blue
      '#22c55e', // green
      '#f59e0b', // amber
      '#ef4444', // red
      '#8b5cf6', // purple
      '#06b6d4', // cyan
    ];

    return {
      labels: data.inventoryHealth.map((item) => item.category),
      datasets: [
        {
          data: data.inventoryHealth.map((item) => item.value),
          backgroundColor: colors.slice(0, data.inventoryHealth.length),
          hoverBackgroundColor: colors.slice(0, data.inventoryHealth.length).map((c) => c + 'dd'),
        },
      ],
    };
  });

  readonly inventoryChartOptions = {
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 15,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw || 0;
            return ` ${context.label}: ${formatCurrency(value)}`;
          },
        },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
  };

  // Financial Overview Chart Data (Bar chart)
  readonly financialChartData = computed(() => {
    const data = this.dashboardStats();
    if (!data?.financialOverview?.length) {
      return null;
    }

    return {
      labels: data.financialOverview.map((item) => item.month),
      datasets: [
        {
          label: 'Sales',
          backgroundColor: '#22c55e',
          borderColor: '#22c55e',
          data: data.financialOverview.map((item) => item.sales),
        },
        {
          label: 'Expenses',
          backgroundColor: '#ef4444',
          borderColor: '#ef4444',
          data: data.financialOverview.map((item) => item.expenses),
        },
      ],
    };
  });

  readonly financialChartOptions = {
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw || 0;
            return ` ${context.dataset.label}: ${formatCurrency(value)}`;
          },
        },
      },
    },
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: number) => {
            if (value >= 1000000) {
              return (value / 1000000).toFixed(1) + 'M';
            } else if (value >= 1000) {
              return (value / 1000).toFixed(0) + 'K';
            }
            return value;
          },
        },
      },
    },
  };

  // Quick actions ordered by priority
  readonly allQuickActions: QuickAction[] = [
    // High Priority - Core Business Operations
    {
      icon: 'pi pi-shopping-cart',
      label: 'Record Sale',
      route: '/sales/new',
      permission: 'sale.create',
      color: '#22c55e',
      bgColor: '#dcfce7',
    },
    {
      icon: 'pi pi-box',
      label: 'Add Product',
      route: '/products/new',
      permission: 'product.create',
      color: '#3b82f6',
      bgColor: '#dbeafe',
    },
    {
      icon: 'pi pi-wallet',
      label: 'Add Expense',
      route: '/expenses/new',
      permission: 'expense.create',
      color: '#f59e0b',
      bgColor: '#fef3c7',
    },

    // Medium Priority - Customer & Procurement
    {
      icon: 'pi pi-user-plus',
      label: 'Add Customer',
      route: '/customers/new',
      permission: 'customer.create',
      color: '#ec4899',
      bgColor: '#fce7f3',
    },
    {
      icon: 'pi pi-truck',
      label: 'New Purchase Order',
      route: '/procurement/purchase-orders/new',
      permission: 'purchaseOrder.create',
      color: '#6366f1',
      bgColor: '#e0e7ff',
    },
    {
      icon: 'pi pi-users',
      label: 'Add Staff',
      route: '/staff/new',
      permission: 'staff.create',
      color: '#10b981',
      bgColor: '#d1fae5',
    },

    // Lower Priority - Additional Operations
    {
      icon: 'pi pi-shield',
      label: 'Create Role',
      route: '/roles/new',
      permission: 'role.create',
      color: '#ef4444',
      bgColor: '#fee2e2',
    },
    {
      icon: 'pi pi-bookmark',
      label: 'Add Brand',
      route: '/brands/new',
      permission: 'brand.create',
      color: '#06b6d4',
      bgColor: '#cffafe',
    },
    {
      icon: 'pi pi-tag',
      label: 'Add Category',
      route: '/categories/new',
      permission: 'category.create',
      color: '#8b5cf6',
      bgColor: '#ede9fe',
    },
    {
      icon: 'pi pi-building',
      label: 'Add Supplier',
      route: '/procurement/suppliers/new',
      permission: 'supplier.create',
      color: '#14b8a6',
      bgColor: '#ccfbf1',
    },
  ];

  // Filter actions by permission and limit to top 6
  readonly topQuickActions = computed(() =>
    this.allQuickActions
      .filter((action) => this.authService.hasPermission(action.permission))
      .slice(0, 6)
  );

  // Check if any quick actions are available
  readonly hasQuickActions = computed(() => this.topQuickActions().length > 0);

  ngOnInit() {
    this.loadDashboardStats();
    this.loadRecentMessages();
  }

  private loadDashboardStats() {
    const branchId = this.branchService.currentBranchId();
    if (!branchId) return;

    // Check if user has at least one dashboard permission
    const hasAnyDashboardPermission =
      this.canViewSales() ||
      this.canViewExpenses() ||
      this.canViewInventory() ||
      this.canViewFinancial();

    if (!hasAnyDashboardPermission) return;

    this.statsLoading.set(true);
    this.dashboardService.getStats(branchId).subscribe({
      next: (stats) => {
        this.dashboardStats.set(stats);
        this.statsLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load dashboard stats:', err);
        this.statsLoading.set(false);
      },
    });
  }

  onStatClick(stat: StatCard) {
    if (stat.route) {
      this.router.navigate([stat.route]);
    }
  }

  onQuickAction(action: QuickAction) {
    this.router.navigate([action.route]);
  }

  openMessages() {
    this.router.navigate(['/messages']);
  }

  openInboxMessage(_message: AdminMessage) {
    this.router.navigate(['/messages'], { queryParams: { view: 'inbox' } });
  }

  formatMessageDate(value: string) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private loadRecentMessages() {
    if (!this.canViewMessages()) {
      return;
    }

    this.messagesLoading.set(true);
    this.messagesService.getInbox({ page: 1, limit: 5 }).subscribe({
      next: (response) => {
        this.recentMessages.set(response.data);
        this.messagesLoading.set(false);
      },
      error: () => {
        this.recentMessages.set([]);
        this.messagesLoading.set(false);
      },
    });
  }
}
