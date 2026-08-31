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
import { SalesReportData, ReportQuery } from '../../models/report.model';
import {
  DateRangePickerComponent,
  DateRange,
  parseLocalDate,
} from '../../components/date-range-picker/date-range-picker.component';

@Component({
  selector: 'app-sales-report',
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
  templateUrl: './sales-report.component.html',
  styleUrl: './sales-report.component.scss',
})
export class SalesReportComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly reportsService = inject(ReportsService);
  private readonly branchService = inject(BranchService);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<SalesReportData | null>(null);
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

  // Chart data
  readonly trendChartData = computed(() => {
    const reportData = this.data();
    if (!reportData) return null;

    return {
      labels: reportData.dailyTrends.map((d) => this.formatDateLabel(d.date)),
      datasets: [
        {
          label: 'Revenue (UGX)',
          data: reportData.dailyTrends.map((d) => d.revenue),
          fill: true,
          borderColor: '#009688',
          backgroundColor: 'rgba(0, 150, 136, 0.1)',
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

  readonly topProductsChartData = computed(() => {
    const reportData = this.data();
    if (!reportData) return null;

    const topFive = reportData.topProducts.slice(0, 5);
    return {
      labels: topFive.map((p) => this.truncate(p.productName, 20)),
      datasets: [
        {
          label: 'Revenue',
          data: topFive.map((p) => p.revenue),
          backgroundColor: ['#009688', '#FFB300', '#263238', '#009688', '#FFB300'],
        },
      ],
    };
  });

  readonly topProductsChartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
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
    this.reportSubscription = this.reportsService.getSalesReport(this.currentQuery).subscribe({
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
      .downloadSalesReportPdf(this.currentQuery)
      .subscribe({
        next: (blob) => {
          this.reportsService.downloadFile(
            blob,
            `sales-report-${this.currentQuery!.startDate}-${this.currentQuery!.endDate}.pdf`
          );
          this.isExporting.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Failed to export sales report');
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

  private truncate(str: string, length: number): string {
    return str.length > length ? str.substring(0, length) + '...' : str;
  }
}
