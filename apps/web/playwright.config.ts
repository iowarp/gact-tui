import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// The visual suite renders the in-repo neutral `gact` brand by default. A
// product brand (e.g. CLIO, owned by the embedding project) is exercised by
// setting GACT_BRAND=<id> (plus GACT_BRAND_SRC=<dir> for an external brand),
// which always wins over this default.
const BRAND = process.env['GACT_BRAND'] ?? 'gact';

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
