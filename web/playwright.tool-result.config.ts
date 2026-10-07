import { defineConfig } from '@playwright/test';
import production from './playwright.config';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const previewPort = Number.parseInt(process.env['CLIO_PREVIEW_PORT'] ?? '4173', 10);

// Result formatting is shared with recorded variant steps and other surfaces.
// Exercise those real components separately from the production transcript's
// compact rows, without restoring the retired public activity switch.
export default defineConfig({
  ...production,
  testIgnore: [],
  testMatch: '**/tool-result-presentation.spec.ts',
  webServer: [
    {
      command: 'node e2e/fixture-server.mjs',
      env: { CLIO_FIXTURE_PORT: String(fixturePort) },
      port: fixturePort,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${previewPort} --strictPort`,
      port: previewPort,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
