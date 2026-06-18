import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// The visual suite exercises the CLIO product (the brand under test): its
// screenshots + string assertions are CLIO-branded. Default the brand to
// `clio` so `test:visual` stays valid even when GACT_BRAND is unset; an
// explicit GACT_BRAND still wins (e.g. to render the neutral profile).
const BRAND = process.env['GACT_BRAND'] ?? 'clio';

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  retries: 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  },
  webServer: {
    // Build (with the selected brand baked in) then preview, so the served
    // dist always matches BRAND regardless of any prior build.
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'] && !process.env['GACT_BRAND'],
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { GACT_BRAND: BRAND },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
