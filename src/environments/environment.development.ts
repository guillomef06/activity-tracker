/**
 * Development environment configuration
 * Used when building with --configuration development or running ng serve
 */
export const environment = {
  production: false,
  appVersion: '1.0.0-dev',
  apiUrl: 'http://localhost:8080/api', // For local backend development
  enableDebug: true,
  enableMockData: true,
  storageKey: 'activity-tracker-dev'
};
