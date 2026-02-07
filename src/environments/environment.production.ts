/**
 * Production environment configuration
 * Used when building with --configuration production
 */
export const environment = {
  production: true,
  appVersion: '1.0.0',
  apiUrl: '', // Will be configured when backend is ready (e.g., Supabase, Spring Boot)
  enableDebug: false,
  enableMockData: false,
  storageKey: 'activity-tracker-prod'
};
