import { Injectable, signal, computed, effect } from '@angular/core';
import { AuthService, Branch } from './auth.service';
export type { Branch };

const CURRENT_BRANCH_KEY = 'mrp_current_branch';

@Injectable({
  providedIn: 'root',
})
export class BranchService {
  private readonly _currentBranch = signal<Branch | null>(null);

  readonly currentBranch = this._currentBranch.asReadonly();
  readonly currentBranchId = computed(() => this._currentBranch()?.id ?? null);
  readonly currentBranchName = computed(() => this._currentBranch()?.name ?? '');

  constructor(private readonly authService: AuthService) {
    // Load from storage on init
    this.loadFromStorage();

    // Initialize branch when branches change
    effect(() => {
      const branches = this.authService.branches();
      const currentBranch = this._currentBranch();
      if (
        branches.length > 0 &&
        (!currentBranch || !branches.some((branch) => branch.id === currentBranch.id))
      ) {
        this.initializeBranch(branches);
      }
    });

    // Clear branch when user logs out
    effect(() => {
      const user = this.authService.user();
      if (!user) {
        this.clear();
      }
    });
  }

  /**
   * Get all accessible branches (sorted with main first)
   */
  get availableBranches(): Branch[] {
    const branches = this.authService.branches();
    return this.sortBranches(branches);
  }

  /**
   * Switch to a different branch
   */
  switchBranch(branch: Branch): void {
    this._currentBranch.set(branch);
    localStorage.setItem(CURRENT_BRANCH_KEY, JSON.stringify(branch));
  }

  /**
   * Clear branch context (on logout)
   */
  clear(): void {
    this._currentBranch.set(null);
    localStorage.removeItem(CURRENT_BRANCH_KEY);
  }

  private initializeBranch(branches: Branch[]): void {
    // Check for stored branch first
    const stored = this.getStoredBranch();
    if (stored && branches.some((b) => b.id === stored.id)) {
      this._currentBranch.set(stored);
      return; // Already set from storage
    }

    // Sort branches (main first) and select first one
    const sorted = this.sortBranches(branches);
    if (sorted.length > 0) {
      this.switchBranch(sorted[0]);
    }
  }

  private sortBranches(branches: Branch[]): Branch[] {
    return [...branches].sort((a, b) => {
      // isMain branches come first
      if (a.isMain && !b.isMain) return -1;
      if (!a.isMain && b.isMain) return 1;
      // Then sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }

  private loadFromStorage(): void {
    const branch = this.getStoredBranch();
    if (branch) {
      this._currentBranch.set(branch);
    }
  }

  private getStoredBranch(): Branch | null {
    try {
      const stored = localStorage.getItem(CURRENT_BRANCH_KEY);
      if (stored) {
        return JSON.parse(stored) as Branch;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }
}
