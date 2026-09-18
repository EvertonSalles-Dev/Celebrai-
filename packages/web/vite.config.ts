import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Configuração do Vite.
 *
 * - Alias `@/` aponta para `src`, mantendo imports legíveis.
 * - O proxy de `/api` para o backend evita CORS em desenvolvimento e faz o
 *   front falar com a API pelo mesmo origin.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    outDir: resolve(__dirname, '../../dist'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          scanner: ['html5-qrcode'],
        },
      },
    },
  },
});
