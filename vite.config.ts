import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// BASE_URL configurable: en GitHub Pages se usa "/NOMBRE-REPOSITORIO/".
// Por defecto "./" (rutas relativas) funciona en cualquier subcarpeta.
const base = process.env.VITE_BASE ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/victory')) return 'charts';
          if (id.includes('/src/game/')) return 'engine';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/balance/**'],
    testTimeout: 60000,
  },
});
