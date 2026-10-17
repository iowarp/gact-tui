import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: 'ndp-source.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 45000,
  outputDir: process.env['CLIO_REVIEW_EVIDENCE'] ?? 'test-results/ndp',
  use: {
    baseURL: 'http://127.0.0.1:5219',
    channel: process.env['CLIO_BROWSER_CHANNEL'],
    screenshot: 'only-on-failure',
  },
});
