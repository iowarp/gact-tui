/**
 * Screenshot the provenance lineage view off the regrammar bench (prov.html),
 * which renders the REAL EarthScope route captured from the live backend.
 *
 * Start the bench first (its own port, never the app's 4173):
 *   npx vite --config scripts/viz-shots/vite.config.mts
 * then:
 *   node scripts/viz-shots/shoot-prov.mjs before   # or: after
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { resolve } from 'node:path';

const PHASE = process.argv[2] ?? 'after';
const APP = process.env.BENCH ?? 'http://localhost:4194/prov.html';
const outDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'prov-regrammar');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1500, height: 900 },
  colorScheme: 'dark',
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="detail-provenance"], [role="tab"]', { timeout: 20000 });

for (const tab of await page.getByRole('tab', { name: /provenance/i }).all()) await tab.click();
await page.waitForSelector('[data-testid="route-graph"]', { timeout: 20000 });
await page.waitForTimeout(1200);

const shot = async (selector, name) => {
  const el = await page.$(selector);
  if (!el) {
    console.log('MISSING', selector);
    return;
  }
  await el.screenshot({ path: resolve(outDir, name) });
  console.log('wrote', name);
};

await shot('#bench-detail', `${PHASE}-01-panel-320wide.png`);
await shot('#bench-wide [data-testid="route-graph"]', `${PHASE}-02-graph-canvas.png`);
await page.screenshot({ path: resolve(outDir, `${PHASE}-03-full-bench.png`), fullPage: false });
console.log('wrote', `${PHASE}-03-full-bench.png`);

// The collapsed transform's run list — only the regrammar has one.
const multiplicity = await page.$('#bench-wide [data-testid="route-node-multiplicity"]');
if (multiplicity) {
  await multiplicity.click();
  await page.waitForTimeout(400);
  await shot('#bench-wide [data-testid="route-graph"]', `${PHASE}-04-runs-expanded.png`);
} else if (PHASE === 'after') {
  console.log('MISSING route-node-multiplicity — the collapse badge did not render');
}

await browser.close();
console.log('done ->', outDir);
