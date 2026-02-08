import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Core Supabase service that initializes and provides the Supabase client
 * This service is a singleton that all other services use to interact with Supabase
 */
@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    // Initialize Supabase client with credentials from environment
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );
  }

  /**
   * Get the Supabase client instance
   * Use this to access Supabase features (auth, database, storage, etc.)
   */
  get client(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Get the auth instance
   * Shortcut for this.client.auth
   */
  get auth() {
    return this.supabase.auth;
  }

  /**
   * Get the database instance
   * Shortcut for this.client.from()
   */
  from(table: string) {
    return this.supabase.from(table);
  }
}
