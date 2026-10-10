import { defineConfig, devices } from '@playwright/test';

/**
 * Specs that drive a LIVE CLIO (never the fixture server): context sizing and
 * long-operation progress need a real host, real GPUs and real installs.
 *
 *   CLIO_ENDPOINT=http://127.0.0.1:8787 pnpm exec playwright test -c playwright.live.config.ts
 *
 * The UI is served by Vite on CLIO_UI_PORT (default 5173, one of CLIO's
 * default trusted browser origins; set CLIO_GACT_CORS_ORIGINS on the CLIO
 * side for any other port). The header of tests/deployment/live/infrastructure.spec.ts
 * lists the remaining variables.
 */
const uiPort = Number.parseInt(process.env['CLIO_UI_PORT'] ?? '5173', 10);
if (!Number.isSafeInteger(uiPort) || uiPort < 1 || uiPort > 65_535) {
  throw new Error(`Invalid CLIO_UI_PORT: ${process.env['CLIO_UI_PORT'] ?? ''}`);
}

export default defineConfig({
  testDir: './tests/deployment/live',
  fullyParallel: false,
  // One live CLIO and one execution host: operations must not interleave.
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  timeout: Number.parseInt(process.env['CLIO_LIVE_TEST_TIMEOUT_MS'] ?? '2700000', 10),
  use: {
    baseURL: `http://127.0.0.1:${uiPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec vite --host 127.0.0.1 --port ${uiPort} --strictPort`,
    port: uiPort,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
