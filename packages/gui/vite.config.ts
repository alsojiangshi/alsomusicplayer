import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: './',
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, '../core/src/browser.ts'),
    },
  },
  build: {
    // Match the WebView baseline Tauri targets on Windows more conservatively
    // so release builds do not ship syntax newer runtimes fail to parse.
    target: 'chrome105',
  },
});
