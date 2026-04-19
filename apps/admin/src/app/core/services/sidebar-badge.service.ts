import { Injectable, inject, signal, computed, OnDestroy, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription, forkJoin, of } from 'rxjs';
import { catchError, startWith } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { BranchService } from './branch.service';

export interface SidebarBadgeCounts {
  salesPayments: number;
  messages: number;
}

@Injectable({
  providedIn: 'root',
})
export class SidebarBadgeService implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly branchService = inject(BranchService);

  private refreshSubscription: Subscription | null = null;
  private readonly REFRESH_INTERVAL = 60000; // 60 seconds

  // Badge counts signals
  readonly salesPaymentsCount = signal(0);
  readonly messagesCount = signal(0);

  // Computed map for easy access by key
  readonly badgeCounts = computed<SidebarBadgeCounts>(() => ({
    salesPayments: this.salesPaymentsCount(),
    messages: this.messagesCount(),
  }));

  constructor() {
    // Refresh counts when branch changes
    effect(() => {
      const branchId = this.branchService.currentBranchId();
      if (branchId) {
        this.refreshCounts();
      }
    });

    this.startRefreshing();
  }

  ngOnDestroy() {
    this.stopRefreshing();
  }

  /**
   * Start periodic refresh of badge counts
   */
  startRefreshing() {
    this.stopRefreshing();

    this.refreshSubscription = interval(this.REFRESH_INTERVAL)
      .pipe(startWith(0))
      .subscribe(() => this.refreshCounts());
  }

  /**
   * Stop periodic refresh
   */
  stopRefreshing() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = null;
    }
  }

  /**
   * Manually trigger a refresh
   */
  refreshCounts() {
    const branchId = this.branchService.currentBranchId();

    // Only fetch counts for endpoints the user has permission to access
    const requests: { [key: string]: any } = {};

    // Sales Payments - branch scoped with sale.approve_payment permission
    if (branchId && this.authService.hasPermission('sale.approve_payment')) {
      requests['salesPayments'] = this.http
        .get<{ pending: number }>(`${environment.apiUrl}/sales/payments/stats?branchId=${branchId}`)
        .pipe(catchError(() => of({ pending: 0 })));
    }

    if (
      this.authService.hasPermission('message.view') ||
      this.authService.hasPermission('message.read')
    ) {
      requests['messages'] = this.http
        .get<{ unread: number }>(`${environment.apiUrl}/messages/unread-count`)
        .pipe(catchError(() => of({ unread: 0 })));
    }

    // If no requests to make, reset all counts
    if (Object.keys(requests).length === 0) {
      this.salesPaymentsCount.set(0);
      this.messagesCount.set(0);
      return;
    }

    forkJoin(requests).subscribe((results: any) => {
      this.salesPaymentsCount.set(results['salesPayments']?.pending ?? 0);
      this.messagesCount.set(results['messages']?.unread ?? 0);
    });
  }

  /**
   * Get badge count for a specific key
   */
  getBadgeCount(key: keyof SidebarBadgeCounts): number {
    return this.badgeCounts()[key];
  }
}
