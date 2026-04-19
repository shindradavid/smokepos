import { Component, Input, Output, EventEmitter, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';
import { BranchService } from '../../../core/services/branch.service';
import {
  SidebarBadgeService,
  SidebarBadgeCounts,
} from '../../../core/services/sidebar-badge.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  permission?: string; // Optional permission required to view this item
  requiresMainBranch?: boolean; // Only show when current branch is main
  badgeKey?: keyof SidebarBadgeCounts; // Link to badge count
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  @Input() collapsed = false;
  @Output() collapsedChange = new EventEmitter<boolean>();

  private readonly authService = inject(AuthService);
  private readonly branchService = inject(BranchService);
  readonly badgeService = inject(SidebarBadgeService);

  private readonly allNavItems: NavItem[] = [
    // Dashboard
    { label: 'Dashboard', icon: 'pi pi-th-large', route: '/dashboard' },

    // Sales & Orders
    { label: 'Sales', icon: 'pi pi-shopping-cart', route: '/sales', permission: 'sale.view' },
    {
      label: 'Sales Payments',
      icon: 'pi pi-money-bill',
      route: '/sales/payments',
      permission: 'sale.approve_payment',
      badgeKey: 'salesPayments',
    },

    // Customers & Services
    { label: 'Customers', icon: 'pi pi-users', route: '/customers', permission: 'customer.view' },

    // Inventory & Products
    {
      label: 'Inventory',
      icon: 'pi pi-shopping-bag',
      route: '/products',
      permission: 'product.view',
    },
    { label: 'Categories', icon: 'pi pi-tags', route: '/categories', permission: 'category.view' },
    { label: 'Brands', icon: 'pi pi-bookmark', route: '/brands', permission: 'brand.view' },

    // Procurement
    {
      label: 'Suppliers',
      icon: 'pi pi-truck',
      route: '/procurement/suppliers',
      permission: 'supplier.view',
    },
    {
      label: 'Purchase Orders',
      icon: 'pi pi-file',
      route: '/procurement/purchase-orders',
      permission: 'purchaseOrder.view',
    },

    // Finance
    { label: 'Expenses', icon: 'pi pi-wallet', route: '/expenses', permission: 'expense.view' },
    { label: 'Reports', icon: 'pi pi-chart-bar', route: '/reports', permission: 'report.view' },

    {
      label: 'Messages',
      icon: 'pi pi-envelope',
      route: '/messages',
      permission: 'message.view',
      badgeKey: 'messages',
    },

    // Administration
    { label: 'Branches', icon: 'pi pi-building', route: '/branches', permission: 'branch.view' },
    { label: 'Staff', icon: 'pi pi-id-card', route: '/staff', permission: 'staff.view' },
    { label: 'Roles', icon: 'pi pi-lock', route: '/roles', permission: 'role.view' },
    {
      label: 'Audit Logs',
      icon: 'pi pi-history',
      route: '/audit-logs',
      permission: 'auditLog.view',
    },
  ];

  // Filter nav items based on user permissions and branch
  readonly navItems = computed(() => {
    return this.allNavItems.filter((item) => this.canView(item));
  });

  // Current branch for display
  readonly currentBranchName = computed(
    () => this.branchService.currentBranch()?.name ?? 'Select Branch'
  );

  /**
   * Check if user can view a nav item
   * If no permission required, always show
   * Otherwise, check if user has the permission
   * Also check if item requires main branch
   */
  private canView(item: NavItem): boolean {
    // Check main branch requirement
    if (item.requiresMainBranch && !this.branchService.currentBranch()?.isMain) {
      return false;
    }
    // Check permission
    if (!item.permission) return true;
    return this.authService.hasPermission(item.permission);
  }

  /**
   * Get badge count for a nav item
   */
  getBadgeCount(item: NavItem): number {
    if (!item.badgeKey) return 0;
    return this.badgeService.getBadgeCount(item.badgeKey);
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }
}
