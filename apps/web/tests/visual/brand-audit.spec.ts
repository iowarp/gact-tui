import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Brand audit — proves the build-time brand injection on the two
 * first-impression surfaces (connect + chat). Run once per profile; the served
 * dist is built with GACT_BRAND, so the profile under test comes from the env.
 *
 *   GACT_BRAND=gact pnpm exec playwright test brand-audit.spec.ts
 *   GACT_BRAND=clio pnpm exec playwright test brand-audit.spec.ts
 *
 * PNGs land in screenshots/audit/brand-<profile>-{connect,chat}.png.
 */
const PROFILE = process.env['GACT_BRAND'] ?? 'clio';
const AUDIT_DIR = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(AUDIT_DIR, { recursive: true });
const shot = (name: string) =>
  resolve(AUDIT_DIR, `brand-${PROFILE}-${name}.png`);

test.describe(`brand audit — ${PROFILE}`, () => {
  test('connect screen shows the brand wordmark + lockup', async ({ page }) => {
    await page.goto('/?route=connect');
    await expect(page.getByTestId('connect-screen')).toBeVisible();
    await page.screenshot({ path: shot('connect'), fullPage: false });
  });

  test('chat shell shows the brand wordmark + accent', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    await expect(page.getByTestId('transcript')).toBeVisible();
    await page.screenshot({ path: shot('chat'), fullPage: false });
  });
});
