import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zynk.app',
  appName: 'Zynk',
  webDir: 'dist',
  server: {
    cleartext: true
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '1032338029517-57p2q55v3r3q8v4j3j1e1h8j5e1h8j5e.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    }
  }
};

export default config;
