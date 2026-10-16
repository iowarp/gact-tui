import { defineConfig } from '@playwright/test';

const evidence = process.env['CLIO_REVIEW_EVIDENCE'];
if (!evidence) throw new Error('Set CLIO_REVIEW_EVIDENCE to the owned browser evidence directory.');
export default defineConfig({
  testDir: '../../e2e',
  testMatch: 'folder-access.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  outputDir: `${evidence}/workspace-editor-browser-results`,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5198', viewport: { width: 1280, height: 844 } },
});
