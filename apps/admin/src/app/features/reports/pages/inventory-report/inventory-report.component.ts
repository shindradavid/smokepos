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
import { InventoryReportData } from '../../models/report.model';
import { formatLocalDate } from '../../components/date-range-picker/date-range-picker.component';

@Component({
  selector: 'app-inventory-report',
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
  ],
  templateUrl: './inventory-report.component.html',
  styleUrl: './inventory-report.component.scss',
})
export class InventoryReportComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly reportsService = inject(ReportsService);
  private readonly branchService = inject(BranchService);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<InventoryReportData | null>(null);
  readonly isExporting = signal(false);
  readonly canExport = computed(() => this.authService.hasPermission('report.export'));
  private reportSubscription?: Subscription;
  private exportSubscription?: Subscription;

  // Effect to reload report when branch changes
  private readonly branchEffect = effect(() => {
    const branchId = this.branchService.currentBranchId();
    if (branchId) {
      this.loadReport();
    }
  });

  // Bar chart for stock by category
  readonly categoryChartData = computed(() => {
    const reportData = this.data();
    if (!reportData || reportData.stockByCategory.length === 0) return null;

    const topCategories = reportData.stockByCategory.slice(0, 10);
    return {
      labels: topCategories.map((c) => c.categoryName),
      datasets: [
        {
          label: 'Retail Value',
          data: topCategories.map((c) => c.totalRetailValue),
          backgroundColor: '#009688',
        },
      ],
    };
  });

  readonly categoryChartOptions = {
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
    // Effect handles initial load when branch is available
  }

  ngOnDestroy(): void {
    this.branchEffect.destroy();
    this.reportSubscription?.unsubscribe();
    this.exportSubscription?.unsubscribe();
  }

  loadReport(): void {
    const branchId = this.branchService.currentBranchId();
    if (!branchId) {
      this.error.set('No branch selected');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    this.reportSubscription?.unsubscribe();
    this.reportSubscription = this.reportsService.getInventoryReport(branchId).subscribe({
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
    const branchId = this.branchService.currentBranchId();
    if (!branchId || !this.canExport()) return;

    this.isExporting.set(true);

    this.exportSubscription?.unsubscribe();
    this.exportSubscription = this.reportsService.downloadInventoryReportPdf(branchId).subscribe({
      next: (blob) => {
        this.reportsService.downloadFile(
          blob,
          `inventory-report-${formatLocalDate(new Date())}.pdf`
        );
        this.isExporting.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to export inventory report');
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

  getStockSeverity(quantity: number, threshold: number): 'danger' | 'warn' | 'success' {
    if (quantity === 0) return 'danger';
    if (quantity <= threshold) return 'warn';
    return 'success';
  }
}
