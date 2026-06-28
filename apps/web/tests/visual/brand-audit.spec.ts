import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Brand audit — proves the build-time brand injection on the release-facing
 * surfaces (connect + chat + settings/about). Run once per profile; the served
 * dist is built with GACT_BRAND, so the profile under test comes from the env.
 *
 *   GACT_BRAND=gact pnpm exec playwright test brand-audit.spec.ts
 *   GACT_BRAND=clio pnpm exec playwright test brand-audit.spec.ts
 *
 * PNGs land in screenshots/audit/brand-<profile>-{connect,chat,settings-about}.png.
 */
const PROFILE = process.env['GACT_BRAND'] ?? 'clio';
const EXPECTED_NAME = PROFILE === 'gact' ? 'GACT' : 'CLIO';
const AUDIT_DIR = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(AUDIT_DIR, { recursive: true });
const shot = (name: string) =>
  resolve(AUDIT_DIR, `brand-${PROFILE}-${name}.png`);

test.describe(`brand audit — ${PROFILE}`, () => {
  test('splash startup state uses the selected brand', async ({ page }) => {
    await page.goto('/?route=splash&hold=1');
    await expect(page.getByTestId('splash-screen')).toBeVisible();
    await expect(page.locator('.splash__wordmark')).toContainText(EXPECTED_NAME);
    await expect(page.locator('.splash__wordmark')).not.toContainText(
      EXPECTED_NAME === 'GACT' ? 'CLIO' : 'GACT',
    );
    await expect(page.locator('body')).not.toContainText('Booting the bundled clio-agent');
    await page.screenshot({ path: shot('splash'), fullPage: false });
  });

  test('splash install state uses the selected brand', async ({ page }) => {
    await page.goto('/?route=splash&install=demo');
    await expect(page.getByTestId('splash-installing')).toBeVisible();
    await expect(page.getByText(`Setting up the ${EXPECTED_NAME} agent backend (first run)`)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('clio-agent Python packages');
    if (PROFILE === 'gact') {
      await expect(page.locator('body')).not.toContainText('clio-agent');
    }
    await page.screenshot({ path: shot('splash-install'), fullPage: false });
  });

  test('connect screen shows the brand wordmark + lockup', async ({ page }) => {
    await page.goto('/?route=connect');
    await expect(page.getByTestId('connect-screen')).toBeVisible();
    await expect(page.getByText(`Welcome to ${EXPECTED_NAME}`)).toBeVisible();
    await page.screenshot({ path: shot('connect'), fullPage: false });
  });

  test('connect errors use backend wording instead of hardcoded product copy', async ({ page }) => {
    await page.goto('/?route=connect');
    await page.getByTestId('connect-url').fill('http://127.0.0.1:9');
    await page.getByTestId('connect-submit').click();
    const error = page.getByTestId('connect-error');
    await expect(error).toBeVisible({ timeout: 8_000 });
    await expect(error).toContainText('local backend running');
    await expect(error).toContainText(`Start ${EXPECTED_NAME}'s backend`);
    await expect(error).not.toContainText('is clio running');
    await page.screenshot({ path: shot('connect-error'), fullPage: false });
  });

  test('chat shell shows the brand wordmark + accent', async ({ page }) => {
    await page.goto('/?route=chat&fixture=streaming');
    await expect(page.getByTestId('chat-screen')).toBeVisible();
    await expect(page.getByTestId('transcript')).toBeVisible();
    await expect(page.getByTestId('composer-input')).toHaveAttribute(
      'placeholder',
      new RegExp(`Ask ${EXPECTED_NAME} anything`, 'i'),
    );
    await page.screenshot({ path: shot('chat'), fullPage: false });
  });

  test('settings about page uses the selected brand', async ({ page }) => {
    await page.goto('/?route=settings&section=about');
    await expect(page.getByTestId('settings-shell')).toBeVisible();
    await expect(page.getByTestId('settings-about')).toBeVisible();
    await expect(page.getByTestId('settings-back')).toContainText(`Back to ${EXPECTED_NAME}`);
    await expect(page.getByRole('heading', { name: `About ${EXPECTED_NAME} Web` })).toBeVisible();
    await expect(page.locator('.dp__stat-value', { hasText: `${EXPECTED_NAME} Web` })).toBeVisible();
    if (PROFILE === 'gact') {
      await expect(page.locator('body')).not.toContainText('github.com/iowarp/clio-agent');
    } else {
      await expect(page.locator('body')).toContainText('github.com/iowarp/clio-agent');
    }
    await page.screenshot({ path: shot('settings-about'), fullPage: false });
  });

  test('operational settings avoid clio-host wording', async ({ page }) => {
    await page.goto('/?route=settings&section=blueprints');
    await expect(page.getByTestId('settings-shell')).toBeVisible();
    await expect(page.getByTestId('dp-agent-blueprints')).toBeVisible();
    await page.getByTestId('blueprint-manual-install-toggle').click();
    await expect(page.getByLabel('Blueprint source')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('clio host');

    await page.goto('/?route=settings&section=expert-packs');
    await expect(page.getByTestId('settings-shell')).toBeVisible();
    await expect(page.getByTestId('dp-expert-packs')).toBeVisible();
    await page.getByTestId('expertpack-validate-toggle').click();
    await expect(page.getByLabel('Expert pack source')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('clio host');
    await page.screenshot({ path: shot('settings-operational'), fullPage: false });
  });
});
