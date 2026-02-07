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
  storageKey: 'activity-tracker-dev'
};
