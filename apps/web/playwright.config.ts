import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// The visual suite renders whatever brand the config file selects (the in-repo
// default is the neutral `gact` brand). The brand is chosen by
// apps/brand.config.json (or a brand.config.local.json override) — NOT an env
// var: both `vite build` and `vite preview` (run by the webServer below) read
// that config file via the shared resolver, so the served build always matches
// the selected brand with no per-suite env injection.

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
    // Build (with the config-selected brand baked in) then preview, so the
    // served dist always matches the brand the config file selects.
    command: `pnpm build && pnpm preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
