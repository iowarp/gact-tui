import { expect, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const screenshotDir = resolve(import.meta.dirname, '..', '..', 'screenshots');
mkdirSync(screenshotDir, { recursive: true });

export const REAL_BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17800';

export let realBackendReachable = false;
try {
  const r = await fetch(`${REAL_BACKEND}/v1/capabilities`, {
    signal: AbortSignal.timeout(800),
  });
  realBackendReachable = r.ok;
} catch {
  realBackendReachable = false;
}

export function shot(name: string) {
  return resolve(screenshotDir, `${name}.png`);
}

export async function openSettingsSection(page: Page, section: string) {
  await page.getByTestId('sessions-settings').click();
  await page.getByTestId(`settings-nav-${section}`).click();
}

export async function connectRealBackend(page: Page): Promise<void> {
  // Returning-user profile: the first-run onboarding tour has its own
  // dedicated audit test and must not block these click-throughs.
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
  });
  await page.route('**/v1/**', async (route) => {
    // SSE responses are unbounded, so route.fetch() would hang reading
    // the body. Let those pass through and only shim finite JSON endpoints.
    try {
      if (route.request().url().includes('/events')) {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
      await route.fulfill({ response: resp, headers });
    } catch (err) {
      if (page.isClosed()) return;
      throw err;
    }
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(REAL_BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 8_000 });
}

export async function withRealBackendPage<T>(
  browser: Browser,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await connectRealBackend(page);
    return await run(page);
  } finally {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await ctx.close();
  }
}
