import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';

/**
 * Manages anonymous voter identity via a UUID persisted in localStorage.
 * Works for both authenticated and unauthenticated users.
 * The token is stable across page reloads for a given browser/device.
 */
@Injectable({
  providedIn: 'root',
})
export class VoterTokenService {
  private readonly storageService = inject(StorageService);
  private readonly STORAGE_KEY = 'guide_voter_token';

  /**
   * Returns the voter token for this browser.
   * Creates and persists a new UUID if none exists yet.
   */
  getVoterToken(): string {
    const existing = this.storageService.get<string>(this.STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const token = crypto.randomUUID();
    this.storageService.set(this.STORAGE_KEY, token);
    return token;
  }
}
