import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'audit');
mkdirSync(dir, { recursive: true });
const shot = (s: string) => resolve(dir, `${s}.png`);

const BACKEND = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17800';
let reachable = false;
try {
  const r = await fetch(`${BACKEND}/v1/capabilities`, { signal: AbortSignal.timeout(1500) });
  reachable = r.ok;
} catch {}

async function connect(browser: any) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/v1/**', async (route: any) => {
    if (route.request().url().includes('/events')) { await route.continue(); return; }
    const resp = await route.fetch();
    await route.fulfill({ response: resp, headers: { ...resp.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto('/?route=connect');
  await page.getByTestId('connect-url').fill(BACKEND);
  await page.getByTestId('connect-submit').click();
  await expect(page.getByTestId('chat-screen')).toBeVisible({ timeout: 10_000 });
  return { page, close: async () => ctx.close() };
}

test.describe('debug rail navigation', () => {
  test.skip(!reachable, 'no clio');

  for (const rail of ['workspaces', 'agents', 'tools', 'prompts', 'mcp', 'memory', 'metrics', 'doctor', 'plugins', 'settings']) {
    test(`rail-${rail} debug capture`, async ({ browser }) => {
      const { page, close } = await connect(browser);
      const btn = page.getByTestId(`rail-${rail}`);
      const exists = await btn.isVisible().catch(() => false);
      console.log(`rail-${rail}: visible=${exists}`);
      if (exists) {
        await btn.click();
        await page.waitForTimeout(1200);
        // Capture all testids on the page
        const ids = await page.locator('[data-testid]').evaluateAll((els: Element[]) =>
          els.map((e) => (e as HTMLElement).dataset['testid']).filter(Boolean),
        );
        console.log(`rail-${rail} testids on page:`, JSON.stringify([...new Set(ids)].slice(0, 50)));
      }
      await page.screenshot({ path: shot(`debug-rail-${rail}`), fullPage: false });
      await close();
    });
  }
});
