import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { Subscription } from 'rxjs';

import { ReportsService } from '../../services/reports.service';
import { BranchService } from '../../../../core/services/branch.service';
import { AuthService } from '../../../../core/services/auth.service';
import { FinancialReportData, ReportQuery } from '../../models/report.model';
import {
  DateRangePickerComponent,
  DateRange,
  parseLocalDate,
} from '../../components/date-range-picker/date-range-picker.component';

@Component({
  selector: 'app-financial-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartModule,
    CardModule,
    ButtonModule,
    TableModule,
    ProgressSpinnerModule,
    MessageModule,
    DateRangePickerComponent,
  ],
  templateUrl: './financial-report.component.html',
  styleUrl: './financial-report.component.scss',
})
export class FinancialReportComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly reportsService = inject(ReportsService);
  private readonly branchService = inject(BranchService);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<FinancialReportData | null>(null);
  readonly isExporting = signal(false);
  readonly canExport = computed(() => this.authService.hasPermission('report.export'));

  private currentDateRange: DateRange | null = null;
  private currentQuery: ReportQuery | null = null;
  private isInitialized = false;
  private reportSubscription?: Subscription;
  private exportSubscription?: Subscription;

  // Effect to reload report when branch changes
  private readonly branchEffect = effect(() => {
    const branchId = this.branchService.currentBranchId();
    if (branchId && this.isInitialized && this.currentDateRange) {
      this.updateQueryAndLoad();
    }
  });

  // Revenue vs Expenses bar chart
  readonly comparisonChartData = computed(() => {
    const reportData = this.data();
    if (!reportData || reportData.monthlyBreakdown.length === 0) return null;

    return {
      labels: reportData.monthlyBreakdown.map((m) => this.formatMonthLabel(m.month)),
      datasets: [
        {
          label: 'Revenue',
          data: reportData.monthlyBreakdown.map((m) => m.revenue),
          backgroundColor: '#009688',
        },
        {
          label: 'Expenses',
          data: reportData.monthlyBreakdown.map((m) => m.expenses),
          backgroundColor: '#FFB300',
        },
      ],
    };
  });

  readonly comparisonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: number) => this.formatCurrencyShort(value),
        },
      },
    },
  };

  // Profit trend line chart
  readonly profitChartData = computed(() => {
    const reportData = this.data();
    if (!reportData || reportData.dailyTrends.length === 0) return null;

    return {
      labels: reportData.dailyTrends.map((d) => this.formatDateLabel(d.date)),
      datasets: [
        {
          label: 'Daily Profit',
          data: reportData.dailyTrends.map((d) => d.profit),
          fill: true,
          borderColor: '#009688',
          backgroundColor: 'rgba(0, 150, 136, 0.1)',
          tension: 0.4,
        },
      ],
    };
  });

  readonly profitChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        ticks: {
          callback: (value: number) => this.formatCurrencyShort(value),
        },
      },
    },
  };

  // Expense breakdown doughnut
  readonly expenseChartData = computed(() => {
    const reportData = this.data();
    if (!reportData || reportData.expenseByCategory.length === 0) return null;

    const colors = ['#263238', '#FFB300', '#009688', '#263238', '#FFB300', '#009688'];
    return {
      labels: reportData.expenseByCategory.map((e) => this.formatCategoryName(e.category)),
      datasets: [
        {
          data: reportData.expenseByCategory.map((e) => e.amount),
          backgroundColor: colors.slice(0, reportData.expenseByCategory.length),
        },
      ],
    };
  });

  readonly expenseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: {
          usePointStyle: true,
        },
      },
    },
  };

  ngOnInit(): void {
    this.isInitialized = true;
  }

  ngOnDestroy(): void {
    this.branchEffect.destroy();
    this.reportSubscription?.unsubscribe();
    this.exportSubscription?.unsubscribe();
  }

  onDateRangeChange(range: DateRange): void {
    this.currentDateRange = range;
    this.updateQueryAndLoad();
  }

  private updateQueryAndLoad(): void {
    const branchId = this.branchService.currentBranchId();
    if (!branchId || !this.currentDateRange) {
      this.error.set('No branch selected');
      return;
    }

    this.currentQuery = {
      branchId,
      startDate: this.currentDateRange.startDate,
      endDate: this.currentDateRange.endDate,
    };

    this.loadReport();
  }

  loadReport(): void {
    if (!this.currentQuery) return;

    this.isLoading.set(true);
    this.error.set(null);

    this.reportSubscription?.unsubscribe();
    this.reportSubscription = this.reportsService.getFinancialReport(this.currentQuery).subscribe({
      next: (data) => {
        this.data.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load report');
        this.isLoading.set(false);
      },
    });
  }

  exportPdf(): void {
    if (!this.currentQuery || !this.canExport()) return;

    this.isExporting.set(true);

    this.exportSubscription?.unsubscribe();
    this.exportSubscription = this.reportsService
      .downloadFinancialReportPdf(this.currentQuery)
      .subscribe({
        next: (blob) => {
          this.reportsService.downloadFile(
            blob,
            `financial-report-${this.currentQuery!.startDate}-${this.currentQuery!.endDate}.pdf`
          );
          this.isExporting.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Failed to export financial report');
          this.isExporting.set(false);
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/reports']);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(value);
  }

  formatCategoryName(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
  }

  private formatCurrencyShort(value: number): string {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  }

  private formatDateLabel(dateStr: string): string {
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
  }

  private formatMonthLabel(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-UG', { month: 'short', year: '2-digit' });
  }
}
