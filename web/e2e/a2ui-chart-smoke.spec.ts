import { expect, test, type Locator, type Page } from '@playwright/test';

// iowarp/clio-agent#1533 phase 1: the chart-kernel branch (clio.chart.v1,
// shared `/selection/<key>` bindings) shipped with no Playwright fixture for
// a chart surface. This adds one: a scatter preset over INLINE `data` rows
// (no artifact/dataUri plumbing needed for a render smoke) proves the Vega
// kernel actually draws in a real browser, and a second surface with a
// clio.chart.v1 and a clio.data-table.v1 bound to the same selection path
// proves the shared-selection wiring the branch adds.

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
const unexpectedErrors = new WeakMap<Page, string[]>();

// The conversation panel has a fixed "requires responses" region docked
// below it, outside the scrollable transcript; a locator screenshot tall
// enough to need scroll-and-stitch re-captures that fixed region in every
// tile, ghosting it into the image. A viewport tall enough for the whole
// surface card in one shot avoids that; `clip` crops to the card alone.
test.use({ viewport: { width: 1280, height: 1800 } });

/**
 * One un-stitched screenshot of `locator`, cropped to its own bounding box.
 * A detached surface (no owning message — see revealSurface) renders as a
 * `bg-card/70` floating card near the tail of the transcript, so the last
 * real message shows through faintly behind its header; that is this app's
 * existing treatment for an unowned surface, not something this spec papers
 * over.
 */
async function screenshotElement(page: Page, locator: Locator, path: string) {
  // Transcript layout can replace the surface while scrollIntoViewIfNeeded
  // waits for stability. Reacquire it on that transient detach; never accept
  // a missing chart or an empty capture as a successful screenshot.
  await expect(async () => {
    await locator.scrollIntoViewIfNeeded({ timeout: 1_000 });
    await expect(
      locator.locator('[data-slot="a2ui-chart-view"]').locator('canvas, svg'),
    ).toHaveCount(1, { timeout: 1_000 });
    const box = await locator.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error('element has no visible bounding box to screenshot');
    }
    await page.screenshot({ path, clip: box });
  }).toPass({ timeout: 5_000 });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  unexpectedErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  const reset = await page.request.post(`${fixtureEndpoint}/__test/reset`);
  expect(reset.ok()).toBe(true);
  await page.addInitScript((endpoint) => {
    try {
      localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
    } catch {
      // MCP Apps intentionally use an opaque inner origin without storage access.
    }
  }, fixtureEndpoint);
});

test.afterEach(async ({ page }) => {
  expect(unexpectedErrors.get(page) ?? []).toEqual([]);
});

/** Scroll the virtualized transcript to its end so a detached surface mounts. */
async function revealSurface(page: Page) {
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation).toBeVisible();
  const surfaceSection = page.locator('[aria-label^="Interactive surface,"]');
  await expect
    .poll(async () => {
      await conversation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      return surfaceSection.count();
    })
    .toBeGreaterThan(0);
  return surfaceSection;
}

/** Check the live chart node, including a transient surface replacement during hydration. */
async function expectRenderedChart(chartView: Locator) {
  await expect(async () => {
    const rendered = chartView.locator('canvas, svg');
    expect(await rendered.count()).toBe(1);
    const box = await rendered.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }).toPass({ timeout: 10_000 });
}

test('renders a clio.chart.v1 scatter preset over inline data', async ({ page }) => {
  await page.goto(workspaceUrl);
  await expect(page.getByRole('heading', { name: 'EarthScope NDP evidence review' })).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  const published = await page.request.post(`${fixtureEndpoint}/__test/a2ui-chart-demo`);
  expect(published.ok()).toBe(true);

  const surfaceSection = await revealSurface(page);
  await expect(surfaceSection.getByText('Wave amplitude by run')).toBeVisible();

  // Vega owns `[data-slot="a2ui-chart-view"]`'s children; a mounted canvas or
  // svg node under it is the kernel having actually drawn, not just the
  // React shell around it.
  const chartView = surfaceSection.locator('[data-slot="a2ui-chart-view"]');
  await expect(chartView.locator('canvas, svg')).toHaveCount(1, { timeout: 10_000 });
  // Wait past "Loading rows…" so the card's final (taller) height is what
  // gets captured, not a mid-load layout.
  await expect(surfaceSection.getByRole('img', { name: /· 9 rows$/u })).toBeVisible();

  // Screenshot the surface card itself, not the whole page — the seeded
  // transcript around it (pending interactions, the input footer) is noise
  // for a chart-kernel review screenshot.
  await screenshotElement(page, surfaceSection, test.info().outputPath('chart-scatter-preset.png'));
});

test('keeps the chart background and legend readable across a live theme change', async ({
  page,
}, testInfo) => {
  await page.goto(workspaceUrl);
  await expect(page.getByRole('heading', { name: 'EarthScope NDP evidence review' })).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  expect(
    (
      await page.request.post(`${fixtureEndpoint}/__test/a2ui-chart-demo`, {
        data: { legend: true },
      })
    ).ok(),
  ).toBe(true);
  const surface = await revealSurface(page);
  const chart = surface.locator('[data-slot="a2ui-chart-view"]');
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate(
      (theme) => document.documentElement.classList.toggle('dark', theme === 'dark'),
      theme,
    );
    await expectRenderedChart(chart);
    await expect(surface.getByRole('img', { name: /9 rows$/u })).toBeVisible();
    await expect
      .poll(() =>
        chart.evaluate((node) => {
          const canvas = node.querySelector('canvas');
          if (canvas) return canvas.getContext('2d')?.getImageData(0, 0, 1, 1).data[3];
          return node.querySelector('svg')?.style.backgroundColor === 'transparent' ? 0 : undefined;
        }),
      )
      .toBe(0);
    await screenshotElement(page, surface, testInfo.outputPath(`chart-${theme}.png`));
  }
});

test('the chart still renders in full screen, and again after exiting (#1551/#516 review item 7)', async ({
  page,
}) => {
  await page.goto(workspaceUrl);
  await expect(page.getByRole('heading', { name: 'EarthScope NDP evidence review' })).toBeVisible();

  const published = await page.request.post(`${fixtureEndpoint}/__test/a2ui-chart-demo`);
  expect(published.ok()).toBe(true);

  const surfaceSection = await revealSurface(page);
  const chartFrame = surfaceSection.locator('[data-slot="a2ui-chart"]');
  const chartView = chartFrame.locator('[data-slot="a2ui-chart-view"]');
  await expect(chartView.locator('canvas, svg')).toHaveCount(1, { timeout: 10_000 });
  await expect(chartFrame.getByRole('img', { name: /· 9 rows$/u })).toBeVisible();
  await expectRenderedChart(chartView);

  // `SurfaceFullScreenHost` moves the view's own DOM node to a different
  // portal target (inline vs. dialog) rather than remounting it -- the
  // embed effect must re-run (not silently keep rendering into a
  // now-elsewhere, possibly zero-sized node) for content to still be there.
  // Navigate as a reader before opening the chart. The seeded transcript's
  // pending-response tray can finish growing after the canvas mounts. A
  // programmatic reveal alone leaves bottom-follow engaged, so that late
  // layout can move the toolbar under the composer during the click.
  await page.getByRole('log', { name: 'Conversation' }).hover();
  await page.mouse.wheel(0, -200);
  // Reader navigation can unmount a virtualized tail surface. Return through
  // the actual transcript control before interacting with its chart; scrolling
  // a locator cannot bring a DOM node back into the virtualizer's window.
  const returnToBottom = page.getByRole('button', { name: 'Scroll to bottom', exact: true });
  await expect(returnToBottom).toBeVisible();
  await returnToBottom.click();
  await expect(chartView.locator('canvas, svg')).toHaveCount(1);
  await chartFrame.scrollIntoViewIfNeeded();
  await chartFrame.hover();
  await chartFrame.getByRole('button', { name: 'Full screen' }).click();
  const dialog = page.getByRole('dialog');
  const dialogChartView = dialog.locator('[data-slot="a2ui-chart-view"]');
  await expect(dialogChartView.locator('canvas, svg')).toHaveCount(1, { timeout: 10_000 });
  await expectRenderedChart(dialogChartView);
  await page.screenshot({
    path: test.info().outputPath('chart-fullscreen.png'),
  });

  await dialog.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(chartView.locator('canvas, svg')).toHaveCount(1, { timeout: 10_000 });
  await expectRenderedChart(chartView);
});

test('links selection between clio.chart.v1 and clio.data-table.v1 sharing one path', async ({
  page,
}) => {
  await page.goto(workspaceUrl);
  await expect(page.getByRole('heading', { name: 'EarthScope NDP evidence review' })).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  const published = await page.request.post(`${fixtureEndpoint}/__test/a2ui-linked-selection-demo`);
  expect(published.ok()).toBe(true);

  const surfaceSection = await revealSurface(page);
  const chartView = surfaceSection.locator('[data-slot="a2ui-chart-view"]');
  await expect(chartView.locator('canvas, svg')).toHaveCount(1, { timeout: 10_000 });
  await expect(surfaceSection.getByRole('img', { name: /· 9 rows$/u })).toBeVisible();

  // Click a table row (a real DOM element; the chart's own canvas marks are
  // not a reliable pixel click target headless) — its selection write goes
  // to the same `/selection/sel` path the chart is bound to.
  const row = surfaceSection.getByRole('row', { name: /alpha/u }).first();
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');

  await screenshotElement(
    page,
    surfaceSection,
    test.info().outputPath('chart-linked-selection.png'),
  );
});
