import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@client': path.resolve(__dirname, 'client'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: false,
  },
  publicDir: path.resolve(__dirname, 'client/public'),
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3102', '/uploads': 'http://localhost:3102' },
  },
});
