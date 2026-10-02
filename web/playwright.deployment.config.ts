import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/deployment',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4175',
    port: 4175,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
