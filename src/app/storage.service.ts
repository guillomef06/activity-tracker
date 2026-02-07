import { Injectable } from '@angular/core';

/**
 * Type-safe wrapper around localStorage API
 * Handles JSON serialization/deserialization and error handling
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  /**
   * Save a value to localStorage
   */
  set<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (error) {
      console.error(`Error saving to localStorage [${key}]:`, error);
    }
  }

  /**
   * Retrieve a value from localStorage
   */
  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Error reading from localStorage [${key}]:`, error);
      return null;
    }
  }

  /**
   * Remove a specific key from localStorage
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from localStorage [${key}]:`, error);
    }
  }

  /**
   * Clear all localStorage data
   */
  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }

  /**
   * Check if a key exists in localStorage
   */
  has(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }
}