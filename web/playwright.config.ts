import { defineConfig, devices } from '@playwright/test';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const previewPort = Number.parseInt(process.env['CLIO_PREVIEW_PORT'] ?? '4173', 10);

if (!Number.isSafeInteger(fixturePort) || fixturePort < 1 || fixturePort > 65_535) {
  throw new Error(`Invalid CLIO_FIXTURE_PORT: ${process.env['CLIO_FIXTURE_PORT'] ?? ''}`);
}
if (!Number.isSafeInteger(previewPort) || previewPort < 1 || previewPort > 65_535) {
  throw new Error(`Invalid CLIO_PREVIEW_PORT: ${process.env['CLIO_PREVIEW_PORT'] ?? ''}`);
}

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/tool-result-presentation.spec.ts',
  snapshotPathTemplate:
    '{testDir}/../tests/visual/snapshots/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: false,
  // All files share one stateful fixture server; cross-file workers would reset
  // each other's pending interactions and queues even with fullyParallel=false.
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
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
      command: `pnpm exec vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
      port: previewPort,
      // A different checkout may own the usual port. Reusing it silently
      // tests another build; use CLIO_PREVIEW_PORT for concurrent campaigns.
      reuseExistingServer: false,
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
