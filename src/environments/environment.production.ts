/**
 * Production environment configuration
 * Used when building with --configuration production
 */
export const environment = {
  production: true,
  appVersion: '1.0.0',
  apiUrl: '',
  enableDebug: false,
  storageKey: 'activity-tracker-prod',

  // Supabase Configuration
  // Replace these values with your Supabase production project credentials
  supabase: {
    url: 'https://yeczvyyxchssftvnobdn.supabase.co', // e.g., 'https://xxxxx.supabase.co'
    anonKey: 'sb_publishable_Y2bl2DFMSzaCa5Vk2Vk4Bw_9rnEzkmp', // Public anon key (safe for client-side)
  },
};
