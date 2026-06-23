import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  resolve: {
    alias: {
      // 重定向 core 导入到浏览器安全版本
      '@core': path.resolve(__dirname, '../core/src/browser.ts'),
    },
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      external: [
        'node:fs', 'node:path', 'node:crypto', 'node:child_process',
        'node:os', 'node:process',
      ],
    },
  },
});
