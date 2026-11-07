import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 120000,
  use: { baseURL: 'http://localhost:4173/', viewport: { width: 1366, height: 860 } },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
});
