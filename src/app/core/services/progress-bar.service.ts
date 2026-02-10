import { Injectable, signal } from '@angular/core';

/**
 * ProgressBarService
 * Manages a global progress bar in the application header
 * Provides a centralized loading state for all pages
 */
@Injectable({
  providedIn: 'root'
})
export class ProgressBarService {
  /**
   * Loading state signal
   * When true, displays the progress bar in the header
   */
  public readonly isLoading = signal<boolean>(false);

  /**
   * Show the global progress bar
   */
  public show(): void {
    this.isLoading.set(true);
  }

  /**
   * Hide the global progress bar
   */
  public hide(): void {
    this.isLoading.set(false);
  }

  /**
   * Execute an async operation with automatic progress bar handling
   * @param operation - The async operation to execute
   * @returns Promise that resolves with the operation result
   */
  public async withProgress<T>(operation: () => Promise<T>): Promise<T> {
    try {
      this.show();
      return await operation();
    } finally {
      this.hide();
    }
  }
}
