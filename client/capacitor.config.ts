import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zynk.chat',
  appName: 'Zynk',
  webDir: 'dist',
  server: {
    cleartext: true
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '453406012303-24ik5eoo8v774t003g875l8d6qc8h63j.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    }
  }
};

export default config;
