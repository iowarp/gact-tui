/**
 * Screenshot the three rebuilt surfaces off the viz bench.
 *
 * Start the bench first:
 *   npx vite --config scripts/viz-shots/vite.config.mts
 * then:
 *   node scripts/viz-shots/shoot.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { resolve } from 'node:path';

const APP = process.env.BENCH ?? 'http://localhost:4194/';
const outDir = resolve(import.meta.dirname, '..', '..', 'screenshots', 'viz-rebuild');
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
await page.waitForSelector('.obs-log__row', { timeout: 20000 });
await page.waitForTimeout(900);

const shot = async (selector, name) => {
  const el = await page.$(selector);
  if (!el) {
    console.log('MISSING', selector);
    return;
  }
  await el.screenshot({ path: resolve(outDir, name) });
  console.log('wrote', name);
};

// 1 — timeline log, git-branch rail.
await shot('#bench-obs', '01-log-tree-rail.png');

// 2 — gantt, lanes + branch colours + zoom controls.
await page.click('button[aria-pressed="false"]:has-text("gantt")').catch(async () => {
  await page.getByRole('button', { name: /^gantt$/i }).click();
});
await page.waitForSelector('.obs-gantt__row', { timeout: 20000 });
await page.waitForTimeout(600);
await shot('#bench-obs', '02-gantt-lanes.png');

// 2b — hover a child bar for the tooltip.
const bars = await page.$$('.obs-gantt__bar');
if (bars.length > 3) {
  await bars[3].hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(outDir, '03-gantt-hover-tooltip.png'), clip: { x: 0, y: 0, width: 900, height: 560 } });
  console.log('wrote 03-gantt-hover-tooltip.png');
}

// 2c — zoom in twice to prove the time axis really rescales.
await page.mouse.move(600, 300);
for (let i = 0; i < 2; i += 1) {
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForTimeout(250);
}
await shot('#bench-obs', '04-gantt-zoomed.png');
await page.getByRole('button', { name: 'Fit the whole trace' }).click();
await page.waitForTimeout(300);

// 3 — provenance lineage DAG.
await page.getByRole('tab', { name: /provenance/i }).click();
await page.waitForSelector('[data-testid="route-graph"]', { timeout: 20000 });
await page.waitForTimeout(900);
await shot('#bench-detail', '05-lineage-dag.png');
await shot('[data-testid="route-graph"]', '06-lineage-dag-canvas.png');

// 3b — hover an edge label for the glossary affordance.
const edge = await page.$('[data-testid="route-edge-1"]');
if (edge) {
  await edge.hover();
  await page.waitForTimeout(400);
  await shot('#bench-detail', '07-lineage-hover.png');
}

await browser.close();
console.log('done ->', outDir);
