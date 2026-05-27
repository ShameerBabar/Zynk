import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    base: mode === 'electron' ? './' : '/', // For Electron compatibility, use './', otherwise '/' for correct web deep-routing
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
          changeOrigin: true
        },
        '/uploads': {
          target: 'http://localhost:3001',
          changeOrigin: true
        }
      }
    }
  };
});
