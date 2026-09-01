import { defineConfig, devices } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);

if (!Number.isSafeInteger(fixturePort) || fixturePort < 1 || fixturePort > 65_535) {
  throw new Error(`Invalid CLIO_FIXTURE_PORT: ${process.env['CLIO_FIXTURE_PORT'] ?? ''}`);
}

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate:
    '{testDir}/../tests/visual/snapshots/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/fixture-server.mjs',
      env: { CLIO_FIXTURE_PORT: String(fixturePort) },
      port: fixturePort,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'pnpm exec vite preview --host 127.0.0.1 --port 4173',
      port: 4173,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
