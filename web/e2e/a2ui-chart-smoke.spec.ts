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
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no bounding box to screenshot');
  await page.screenshot({ path, clip: box });
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
  const surfaceSection = page.locator('[aria-label^="Generated UI,"]');
  await expect
    .poll(async () => {
      await conversation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      return surfaceSection.count();
    })
    .toBeGreaterThan(0);
  return surfaceSection;
}

test('renders a clio.chart.v1 scatter preset over inline data', async ({ page }) => {
  await page.goto(workspaceUrl);
  await expect(
    page.getByRole('heading', { name: 'EarthScope NDP evidence review' }),
  ).toBeVisible();
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
  await expect(surfaceSection.locator('[data-slot="a2ui-chart"]').getByText('9 rows')).toBeVisible();

  // Screenshot the surface card itself, not the whole page — the seeded
  // transcript around it (pending interactions, the input footer) is noise
  // for a chart-kernel review screenshot.
  await screenshotElement(
    page,
    surfaceSection,
    'D:/Libraries/Documents/projects/clio_develop_workspace/temp/chart-shots/chart-scatter-preset.png',
  );
});

test('links selection between clio.chart.v1 and clio.data-table.v1 sharing one path', async ({
  page,
}) => {
  await page.goto(workspaceUrl);
  await expect(
    page.getByRole('heading', { name: 'EarthScope NDP evidence review' }),
  ).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  const published = await page.request.post(
    `${fixtureEndpoint}/__test/a2ui-linked-selection-demo`,
  );
  expect(published.ok()).toBe(true);

  const surfaceSection = await revealSurface(page);
  const chartView = surfaceSection.locator('[data-slot="a2ui-chart-view"]');
  await expect(chartView.locator('canvas, svg')).toHaveCount(1, { timeout: 10_000 });
  await expect(surfaceSection.locator('[data-slot="a2ui-chart"]').getByText('9 rows')).toBeVisible();

  // Click a table row (a real DOM element; the chart's own canvas marks are
  // not a reliable pixel click target headless) — its selection write goes
  // to the same `/selection/sel` path the chart is bound to.
  const row = surfaceSection.getByRole('row', { name: /alpha/u }).first();
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');

  await screenshotElement(
    page,
    surfaceSection,
    'D:/Libraries/Documents/projects/clio_develop_workspace/temp/chart-shots/chart-linked-selection.png',
  );
});
