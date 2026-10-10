import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.env.CLIO_OBSERVABILITY_EVIDENCE ?? 'test-results/observability-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 760 }, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto(`http://127.0.0.1:${process.env.CLIO_REVIEW_PORT ?? '5216'}/tests/review/observability.html`);
  await expect(page.getByRole('heading', { name: /Synthetic multi-agent layout fixture/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const gantt = page.getByRole('region', { name: 'Observed execution spans' });
  await expect(gantt.locator('[data-slot="gantt-bar"]')).toHaveCount(5);
  await page.waitForTimeout(500);
  const overview = await gantt.boundingBox();
  const overviewBars = await gantt.locator('[data-slot="gantt-bar"]').evaluateAll((bars) => bars.map((bar) => bar.getBoundingClientRect().bottom));
  if (overviewBars.some((bottom) => bottom > overview.y + overview.height - 32)) throw new Error('Agent overview clips an agent row');
  await page.locator('main').screenshot({ path: resolve(output, 'gantt-agent-overview.png'), animations: 'disabled' });
  for (const name of ['Balance analyst', 'Availability analyst', 'Capacity reviewer', 'Report reviewer']) {
    await gantt.getByRole('button', { name, exact: true }).click();
  }
  await expect(gantt.locator('[data-slot="gantt-bar"]')).toHaveCount(17);
  await page.waitForTimeout(700);
  const bounds = await gantt.locator('[data-slot="gantt-bar"]').evaluateAll((bars) => bars.map((bar) => {
    const rect = bar.getBoundingClientRect();
    return { width: rect.width, left: rect.left, right: rect.right, label: bar.textContent };
  }));
  const short = bounds.find((bar) => bar.label?.includes('Read bike-stations.csv'));
  const long = bounds.find((bar) => bar.label?.includes('Compare station availability'));
  if (!short || !long || long.width / short.width < 100) throw new Error(`Duration geometry is distorted: ${JSON.stringify(bounds)}`);
  if (bounds.some((bar) => bar.left < 150 || bar.right > 1430)) throw new Error(`Fit clips the observed execution: ${JSON.stringify(bounds)}`);
  await page.screenshot({ path: resolve(output, 'gantt-multi-agent.png'), animations: 'disabled' });
  await gantt.getByRole('button', { name: /Compute net station change/ }).click();
  await expect(page.getByRole('region', { name: 'Selected execution event' })).toContainText('73 s');
  await page.getByRole('button', { name: 'Open agent conversation' }).click();
  await expect(page.getByLabel('Opened event')).toContainText('Balance analyst');
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Availability analyst', exact: true })).toBeVisible();
  const timeline = page.getByRole('region', { name: 'Causal activity graph' });
  const rows = timeline.getByRole('button', { name: /Open transcript event/ });
  await expect(rows).toHaveCount(20);
  const sizes = await rows.evaluateAll((nodes) => nodes.map((row) => {
    const graph = row.querySelector('svg[viewBox]');
    return { row: row.getBoundingClientRect().height, graph: graph?.getBoundingClientRect().height };
  }));
  if (sizes.some((size) => size.graph === undefined || Math.abs(size.row - size.graph) > 3)) throw new Error(`Timeline row/connector mismatch: ${JSON.stringify(sizes)}`);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.screenshot({ path: resolve(output, 'timeline-multi-agent.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Capacity reviewer', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await expect(timeline).toContainText('Input count exceeds capacity');
  await timeline.getByRole('button', { name: 'Open transcript event Validate station capacities' }).press('Enter');
  await expect(page.getByLabel('Opened event')).toContainText('Validate station capacities');
  await page.screenshot({ path: resolve(output, 'timeline-agent-filter.png'), animations: 'disabled' });
  for (const width of [800, 390, 1440]) {
    await page.setViewportSize({ width, height: 760 });
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await page.getByRole('button', { name: 'Fit execution' }).click();
    await page.waitForTimeout(250);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Page overflows at ${width}px`);
  }
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ output, bars: bounds.length, timelineRows: sizes.length, errors }));
} finally {
  await browser.close();
}
