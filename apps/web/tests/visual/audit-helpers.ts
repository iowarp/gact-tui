import { expect, type APIResponse, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const auditDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(auditDir, { recursive: true });

export function shot(slug: string): string {
  return resolve(auditDir, `${slug}.png`);
}

export const REAL_BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17800';
export let realBackendReachable = false;
// Probe the backend a few times before declaring it unreachable: the first
// request after a cold import can be slow enough to blow a single short
// timeout, which would spuriously skip the entire suite. A short retry loop
// keeps the gate honest without hanging when clio really is down.
for (let attempt = 0; attempt < 3 && !realBackendReachable; attempt += 1) {
  try {
    const r = await fetch(`${REAL_BACKEND}/v1/capabilities`, {
      signal: AbortSignal.timeout(4000),
    });
    realBackendReachable = r.ok;
  } catch {
    realBackendReachable = false;
  }
}

export async function connect(
  browser: Browser,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Returning-user profile: the first-run onboarding tour must not overlay
  // the surfaces these tests drive. The tour has its own dedicated test.
  await page.addInitScript(() => {
    window.localStorage.setItem('clio.onboarding-done.v1', '1');
  });
  await page.route('**/v1/**', async (route) => {
    if (route.request().url().includes('/events')) {
      await route.continue();
      return;
    }
    // route.fetch() rejects when the underlying request is aborted (the
    // connect flow + SSE churn cancels in-flight /v1 calls). That abort is
    // benign for the proxy shim, so fall back to a plain continue instead of
    // letting the rejection fail the test.
    let resp: APIResponse;
    try {
      resp = await route.fetch();
    } catch {
      await route.continue().catch(() => undefined);
      return;
    }
    const headers = { ...resp.headers(), 'access-control-allow-origin': '*' };
    await route.fulfill({ response: resp, headers }).catch(() => undefined);
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(REAL_BACKEND);
  await page.getByTestId('connect-submit').click();
  // 15s (not 10) so a momentarily-busy backend — clio also serves the live
  // scenarios concurrently — doesn't trip the gate before the chat shell
  // mounts.
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 15_000 });
  return {
    page,
    close: async () => {
      await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
      // Context teardown can race in-flight requests/SSE; a failure here is
      // pure cleanup noise and must not fail an otherwise-green test.
      await ctx.close().catch(() => undefined);
    },
  };
}

export async function withConnectedAuditPage<T>(
  browser: Browser,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const { page, close } = await connect(browser);
  try {
    return await run(page);
  } finally {
    await close();
  }
}

export async function openSettingsSection(page: Page, section: string) {
  await page.getByTestId('sessions-settings').click();
  await page.getByTestId(`settings-nav-${section}`).click();
}

export async function openShortcutSurface(
  browser: Browser,
  options: { key: string; testId: string; screenshot: string },
): Promise<void> {
  const { page, close } = await connect(browser);
  await page.waitForTimeout(1_500);
  // Avoid the textarea capturing global shortcuts.
  await page.locator('body').click();
  await page.keyboard.press(options.key);
  await expect(page.getByTestId(options.testId)).toBeVisible({ timeout: 6_000 });
  await page.screenshot({ path: shot(options.screenshot), fullPage: false });
  await close();
}

/** Select the first available session — many tests need an active
 * session for the Inspector tabs to render. */
export async function pickFirstSession(page: Page) {
  // Wait for the sessions resource to actually populate — the connect
  // flow returns as soon as chat-screen mounts, but the GET /sessions
  // round trip can take a beat behind that.
  const firstRow = page.locator('[data-testid^="session-row-"]').first();
  try {
    await firstRow.waitFor({ state: 'visible', timeout: 6_000 });
  } catch {
    return;
  }
  await firstRow.click();
  // SSE reconnect + transcript load.
  await page.waitForTimeout(1_500);
}
