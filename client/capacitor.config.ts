import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zynk.app',
  appName: 'Zynk',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
