import { defineConfig } from '@playwright/test';
import production from './playwright.config';

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const previewPort = Number.parseInt(process.env['CLIO_PREVIEW_PORT'] ?? '4173', 10);

// Review real shared components with labelled synthetic input separately from
// built production routes. Keep both paths mandatory in CI.
export default defineConfig({
  ...production,
  testIgnore: [],
  testMatch: ['**/tool-result-presentation.spec.ts', '**/dialog-layout.spec.ts'],
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
