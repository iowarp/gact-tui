import { defineConfig } from '@playwright/test';

const evidence = process.env['CLIO_REVIEW_EVIDENCE'];
if (!evidence) throw new Error('Set CLIO_REVIEW_EVIDENCE to a bounded C: capture directory.');

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: 'response-rating.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 45_000,
  outputDir: `${evidence}/browser-results`,
  use: { baseURL: 'http://127.0.0.1:5214', screenshot: 'only-on-failure' },
});
