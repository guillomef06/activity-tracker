import { Injectable, signal } from '@angular/core';

/**
 * ProgressBarService
 * Manages a global progress bar in the application header
 * Provides a centralized loading state for all pages
 */
@Injectable({
  providedIn: 'root',
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
   * Execute an async operation with automatic progress bar handling.
   * A 30-second safety timeout is applied by default to prevent the progress bar
   * from spinning indefinitely if a request hangs (e.g. Supabase token-refresh queue).
   * @param operation - The async operation to execute
   * @param timeoutMs - Maximum duration before the progress bar is forcibly hidden (default: 30 000 ms)
   * @returns Promise that resolves with the operation result
   */
  public async withProgress<T>(operation: () => Promise<T>, timeoutMs = 30_000): Promise<T> {
    try {
      this.show();
      const deadline = new Promise<T>(resolve => setTimeout(() => resolve(undefined as T), timeoutMs));
      return await Promise.race([operation(), deadline]);
    } finally {
      this.hide();
    }
  }
}
