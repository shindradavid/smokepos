import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { Subscription } from 'rxjs';

import { ReportsService } from '../../services/reports.service';
import { BranchService } from '../../../../core/services/branch.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ProcurementReportData, ReportQuery } from '../../models/report.model';
import {
  DateRangePickerComponent,
  DateRange,
} from '../../components/date-range-picker/date-range-picker.component';

@Component({
  selector: 'app-procurement-report',
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
  templateUrl: './procurement-report.component.html',
  styleUrl: './procurement-report.component.scss',
})
export class ProcurementReportComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly reportsService = inject(ReportsService);
  private readonly branchService = inject(BranchService);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<ProcurementReportData | null>(null);
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

  private readonly statusColors: Record<string, string> = {
    draft: '#263238',
    pending_approval: '#FFB300',
    approved: '#009688',
    partially_received: '#009688',
    received: '#009688',
    cancelled: '#263238',
  };

  // Pie chart for PO by status
  readonly statusChartData = computed(() => {
    const reportData = this.data();
    if (!reportData || reportData.byStatus.length === 0) return null;

    return {
      labels: reportData.byStatus.map((s) => this.formatStatus(s.status)),
      datasets: [
        {
          data: reportData.byStatus.map((s) => s.count),
          backgroundColor: reportData.byStatus.map((s) => this.statusColors[s.status] || '#263238'),
        },
      ],
    };
  });

  readonly statusChartOptions = {
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

  // Bar chart for suppliers
  readonly supplierChartData = computed(() => {
    const reportData = this.data();
    if (!reportData || reportData.bySupplier.length === 0) return null;

    const topSuppliers = reportData.bySupplier.slice(0, 8);
    return {
      labels: topSuppliers.map((s) => this.truncate(s.supplierName, 15)),
      datasets: [
        {
          label: 'Total Amount',
          data: topSuppliers.map((s) => s.totalAmount),
          backgroundColor: '#263238',
        },
      ],
    };
  });

  readonly supplierChartOptions = {
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
    this.reportSubscription = this.reportsService
      .getProcurementReport(this.currentQuery)
      .subscribe({
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
      .downloadProcurementReportPdf(this.currentQuery)
      .subscribe({
        next: (blob) => {
          this.reportsService.downloadFile(
            blob,
            `procurement-report-${this.currentQuery!.startDate}-${this.currentQuery!.endDate}.pdf`
          );
          this.isExporting.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Failed to export procurement report');
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

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  getStatusSeverity(status: string): 'secondary' | 'warn' | 'success' | 'info' | 'danger' {
    const map: Record<string, 'secondary' | 'warn' | 'success' | 'info' | 'danger'> = {
      draft: 'secondary',
      pending_approval: 'warn',
      approved: 'success',
      partially_received: 'info',
      received: 'success',
      cancelled: 'danger',
    };
    return map[status] || 'secondary';
  }

  private formatCurrencyShort(value: number): string {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}K`;
    }
    return value.toString();
  }

  private truncate(str: string, length: number): string {
    return str.length > length ? str.substring(0, length) + '...' : str;
  }
}
