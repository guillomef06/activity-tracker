/**
 * Default environment configuration (Development)
 * This file is used by default when running ng serve
 * For production builds, it will be replaced by environment.production.ts
 */
export const environment = {
  production: false,
  appVersion: '1.0.0-dev',
  apiUrl: 'http://localhost:8080/api', // For local backend development
  enableDebug: true,
  enableMockData: true,
  storageKey: 'activity-tracker-dev',
  
  // Supabase Configuration
  // Replace these values with your Supabase project credentials
  // Get them from: Supabase Dashboard → Project Settings → API
  supabase: {
    url: 'YOUR_SUPABASE_URL', // e.g., 'https://xxxxx.supabase.co'
    anonKey: 'YOUR_SUPABASE_ANON_KEY' // Public anon key (safe for client-side)
  }
};
