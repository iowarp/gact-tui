import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const service = 'http://127.0.0.1:18817';
const evidence = process.env['CLIO_REVIEW_EVIDENCE'];
if (!evidence) throw new Error('Set CLIO_REVIEW_EVIDENCE to the bounded C: capture directory.');

test.beforeEach(async ({ page }) => {
  await page.addInitScript((endpoint) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([{ endpoint }]));
  }, service);
});

test('recorded dashboard captures and exports real PNG, bundled HTML and JSON', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const name of ['offline-review.js', 'offline-review.css']) {
    await page.route(`**/${name}`, (route) =>
      route.fulfill({
        path: `${evidence}/renderer/${name}`,
        contentType: name.endsWith('.js') ? 'text/javascript' : 'text/css',
      }),
    );
  }
  await page.goto('/tests/review/dashboard-exports.html?theme=light');
  await expect(page.getByText('Created does not mean fully tested', { exact: true })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${service}/__test/viewers`)).json()).some(
          (viewer: { ready: boolean }) => viewer.ready,
        ),
      { timeout: 15_000 },
    )
    .toBe(true);
  const capture = await page.request.post(`${service}/__test/capture`, { timeout: 20_000 });
  expect(capture.ok(), await capture.text()).toBe(true);
  const metadata = await capture.json();
  expect(metadata.width).toBeGreaterThan(300);
  await testInfo.attach('agent-capture', {
    body: JSON.stringify(metadata, null, 2),
    contentType: 'application/json',
  });
  const toolbar = page.locator('[data-slot="viewer-toolbar"]');
  const exported: Record<string, string> = {};
  for (const [label, extension] of [
    ['PNG image (displayed view)', 'png'],
    ['HTML dashboard (all tabs and data)', 'html'],
    ['Original file', 'json'],
  ]) {
    await toolbar.getByRole('button', { name: 'Download file', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
    if (extension === 'png')
      await page.screenshot({
        path: testInfo.outputPath('dashboard-download-formats.png'),
        animations: 'disabled',
      });
    const started = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    const download = await started;
    expect(await download.failure()).toBeNull();
    exported[extension] = testInfo.outputPath(`raccoon-dashboard.${extension}`);
    await download.saveAs(exported[extension]);
  }
  const pixels = await readFile(exported['png']);
  expect(pixels.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(pixels.length).toBeGreaterThan(10_000);
  expect(JSON.parse(await readFile(exported['json'], 'utf8')).format).toBe('clio.dashboard.v1');
  const html = await readFile(exported['html'], 'utf8');
  expect(html).toContain('CLIO_DASHBOARD_DATA');
  expect(html).toContain('connect-src blob: data:');
  const offline = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const review = await offline.newPage();
    const attemptedNetwork: string[] = [];
    await review.route(/^https?:/u, async (route) => {
      attemptedNetwork.push(route.request().url());
      await route.abort();
    });
    await review.goto(pathToFileURL(exported['html']).href);
    await expect(
      review.getByText('Created does not mean fully tested', { exact: true }),
    ).toBeVisible();
    const image = review.locator('[data-slot="a2ui-dashboard"] img').first();
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(review.getByText('01 · Illustration', { exact: true })).toBeVisible();
    await expect(review.getByText('03 · Browser scene', { exact: true })).toBeVisible();
    const mesh = review.locator('[data-slot="a2ui-mesh-viewport"] div[role="img"]');
    await expect(mesh.locator('canvas')).toBeVisible();
    const camera = () =>
      mesh.evaluate((node) =>
        JSON.stringify(
          (node as HTMLElement & { __clioMeshState?: () => unknown }).__clioMeshState?.(),
        ),
      );
    const before = await camera();
    const bounds = (await mesh.boundingBox())!;
    await review.mouse.move(bounds.x + 70, bounds.y + 70);
    await review.mouse.down();
    await review.mouse.move(bounds.x + 170, bounds.y + 100, { steps: 8 });
    await review.mouse.up();
    await expect.poll(camera).not.toBe(before);
    expect(attemptedNetwork).toEqual([]);
    await review.screenshot({
      path: testInfo.outputPath('offline-dashboard-interactive.png'),
      fullPage: true,
      animations: 'disabled',
    });
  } finally {
    await offline.close();
  }
});

test('formats remain in the fixed toolbar after scrolling a narrow dark dashboard', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tests/review/dashboard-exports.html?theme=dark');
  await expect(page.getByText('Created does not mean fully tested', { exact: true })).toBeVisible();
  await page.getByText('Keep the outputs', { exact: true }).scrollIntoViewIfNeeded();
  const toolbar = page.locator('[data-slot="viewer-toolbar"]');
  await toolbar.getByRole('button', { name: 'Download file', exact: true }).click();
  for (const label of [
    'PNG image (displayed view)',
    'HTML dashboard (all tabs and data)',
    'Original file',
  ]) {
    await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  }
  await page.screenshot({
    path: testInfo.outputPath('narrow-dark-download-formats.png'),
    animations: 'disabled',
  });
});
