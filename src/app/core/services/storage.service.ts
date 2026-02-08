import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving to localStorage [${key}]:`, error);
    }
  }

  get<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;
      
      try {
        return JSON.parse(item);
      } catch {
        // Handle legacy plain string values
        console.warn(`Legacy plain value detected for [${key}], migrating to JSON format`);
        // Return the plain string as-is and re-save it properly
        const plainValue = item as T;
        this.set(key, plainValue);
        return plainValue;
      }
    } catch (error) {
      console.error(`Error reading from localStorage [${key}]:`, error);
      return null;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from localStorage [${key}]:`, error);
    }
  }

  clear(): void {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }

  has(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }
}
