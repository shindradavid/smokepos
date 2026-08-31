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
import { TagModule } from 'primeng/tag';

import { ReportsService } from '../../services/reports.service';
import { BranchService } from '../../../../core/services/branch.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ExpenseReportData, ReportQuery } from '../../models/report.model';
import {
  DateRangePickerComponent,
  DateRange,
  parseLocalDate,
} from '../../components/date-range-picker/date-range-picker.component';

@Component({
  selector: 'app-expenses-report',
  standalone: true,
  imports: [
    CommonModule,
    ChartModule,
    CardModule,
    ButtonModule,
    TableModule,
    ProgressSpinnerModule,
    MessageModule,
    TagModule,
    DateRangePickerComponent,
  ],
  templateUrl: './expenses-report.component.html',
  styleUrl: './expenses-report.component.scss',
})
export class ExpensesReportComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly reportsService = inject(ReportsService);
  private readonly branchService = inject(BranchService);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<ExpenseReportData | null>(null);
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

  private readonly categoryColors = [
    '#263238',
    '#FFB300',
    '#009688',
    '#009688',
    '#263238',
    '#FFB300',
    '#009688',
    '#263238',
    '#263238',
    '#009688',
    '#FFB300',
    '#263238',
    '#FFB300',
    '#263238',
    '#009688',
  ];

  // Doughnut chart for expenses by category
  readonly categoryChartData = computed(() => {
    const reportData = this.data();
    if (!reportData || reportData.byCategory.length === 0) return null;

    return {
      labels: reportData.byCategory.map((c) => this.formatCategoryName(c.category)),
      datasets: [
        {
          data: reportData.byCategory.map((c) => c.amount),
          backgroundColor: this.categoryColors.slice(0, reportData.byCategory.length),
        },
      ],
    };
  });

  readonly categoryChartOptions = {
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

  // Daily trend chart
  readonly trendChartData = computed(() => {
    const reportData = this.data();
    if (!reportData || reportData.dailyTrends.length === 0) return null;

    return {
      labels: reportData.dailyTrends.map((d) => this.formatDateLabel(d.date)),
      datasets: [
        {
          label: 'Expenses (UGX)',
          data: reportData.dailyTrends.map((d) => d.amount),
          fill: true,
          borderColor: '#FFB300',
          backgroundColor: 'rgba(255, 179, 0, 0.1)',
          tension: 0.4,
        },
      ],
    };
  });

  readonly trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
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
    this.reportSubscription = this.reportsService.getExpenseReport(this.currentQuery).subscribe({
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
      .downloadExpenseReportPdf(this.currentQuery)
      .subscribe({
        next: (blob) => {
          this.reportsService.downloadFile(
            blob,
            `expense-report-${this.currentQuery!.startDate}-${this.currentQuery!.endDate}.pdf`
          );
          this.isExporting.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Failed to export expense report');
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
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  }

  private formatDateLabel(dateStr: string): string {
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString('en-UG', { month: 'short', day: 'numeric' });
  }
}
