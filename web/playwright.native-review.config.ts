import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/review',
  testMatch: 'native-installers.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: 'list',
  outputDir: 'D:/CLIO-Develop/native-service-completion-20261016/browser-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5198',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5198 --strictPort',
    port: 5198,
    reuseExistingServer: false,
  },
});
