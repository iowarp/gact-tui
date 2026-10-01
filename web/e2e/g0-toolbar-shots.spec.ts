import { expect, test, type Page } from '@playwright/test';

// G0 (built-in data-view affordances): screenshots of the redesigned
// `SurfaceToolbar` (icon-only, hover-revealed, one canonical order) across
// several component types, reusing the earthquake linked-data demo
// (`web/e2e/a2ui-data-demo-fixture.mjs`: a chart, a map, a table and a metric
// over one referenced dataset). Not a correctness suite (that's
// `a2ui-data-everywhere.spec.ts`/`a2ui-chart-smoke.spec.ts`) — purely visual
// evidence for the G0 slice review, saved under
// `clio_develop_workspace/temp/g0-shots` and deleted once reviewed.

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
const shotsDir = 'D:/Libraries/Documents/projects/clio_develop_workspace/temp/g0-shots';

// Same local-tile routing as a2ui-data-everywhere.spec.ts: the map's
// basemap must not depend on reaching the real OpenStreetMap tile service.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN48uTJfwAIHAPA7h4SLgAAAABJRU5ErkJggg==',
  'base64',
);

test.use({ viewport: { width: 1280, height: 1400 } });

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: TILE_PNG });
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

/** Opens the workspace with the linked earthquake demo (chart/map/table/metric) published. */
async function openDemo(page: Page) {
  const published = await page.request.post(`${fixtureEndpoint}/__test/a2ui-data-demo`);
  expect(published.ok()).toBe(true);
  await page.goto(workspaceUrl);
  await expect(
    page.getByRole('heading', { name: 'EarthScope NDP evidence review' }),
  ).toBeVisible();
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation).toBeVisible();
  const surfaceSection = page.locator('[aria-label^="Generated UI,"]');
  await expect
    .poll(
      async () => {
        await conversation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
        return surfaceSection.count();
      },
      { timeout: 240_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByText('Events reviewed')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByRole('table')).toBeVisible({ timeout: 240_000 });
}

test('G0 toolbar: hidden by default, revealed on hover, per component type', async ({ page }) => {
  test.setTimeout(120_000);
  await openDemo(page);

  const chartFrame = page.locator('[data-slot="a2ui-chart"]');
  const tableCard = page.getByRole('table').locator('xpath=ancestor::*[contains(@class,"rounded-xl")][1]');
  const metricFrame = page.getByText('Events reviewed').locator('xpath=ancestor::*[2]');

  await chartFrame.scrollIntoViewIfNeeded();
  // Move the mouse away from every surface first — a hover-revealed toolbar
  // must actually start hidden, not merely "never asserted hidden".
  await page.mouse.move(5, 5);
  await page.screenshot({ path: `${shotsDir}/01-chart-toolbar-hidden.png`, clip: await chartFrame.boundingBox() ?? undefined });

  await chartFrame.hover();
  const chartToolbar = chartFrame.locator('[data-slot="surface-toolbar"]');
  await expect(chartToolbar).toHaveCSS('opacity', '1', { timeout: 5_000 });
  await page.screenshot({ path: `${shotsDir}/02-chart-toolbar-hover.png`, clip: await chartFrame.boundingBox() ?? undefined });

  // The canonical order for a full-capability component: Filters, Reference
  // this, Full screen, then More.
  const chartButtons = await chartToolbar.getByRole('button').all();
  const chartNames = await Promise.all(chartButtons.map((button) => button.getAttribute('aria-label')));
  expect(chartNames).toEqual(['Filters', 'Reference this', 'Full screen', 'More']);

  await metricFrame.scrollIntoViewIfNeeded();
  await metricFrame.hover();
  await page.screenshot({ path: `${shotsDir}/03-metric-toolbar-hover.png`, clip: await metricFrame.boundingBox() ?? undefined });

  await tableCard.scrollIntoViewIfNeeded();
  await tableCard.hover();
  await page.screenshot({ path: `${shotsDir}/04-table-toolbar-hover.png`, clip: await tableCard.boundingBox() ?? undefined });
});

test('G0 toolbar: the More overflow opens the Download submenu', async ({ page }) => {
  test.setTimeout(120_000);
  await openDemo(page);

  const chartFrame = page.locator('[data-slot="a2ui-chart"]');
  await chartFrame.scrollIntoViewIfNeeded();
  await chartFrame.hover();
  // The dropdown's content portals to the document body, not a descendant
  // of the chart card — scoped to `page`, not `chartFrame`.
  await chartFrame.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: /Download/ }).click();
  await expect(page.getByRole('menuitem', { name: 'PNG image' })).toBeVisible();

  await page.screenshot({ path: `${shotsDir}/05-download-menu-open.png` });
  await page.keyboard.press('Escape');
});

test('G0: a narrow surface still shows the full icon-only toolbar (no label-dropping needed)', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 640, height: 900 });
  await openDemo(page);

  const chartFrame = page.locator('[data-slot="a2ui-chart"]');
  await chartFrame.scrollIntoViewIfNeeded();
  await chartFrame.hover();
  const chartToolbar = chartFrame.locator('[data-slot="surface-toolbar"]');
  await expect(chartToolbar).toHaveCSS('opacity', '1', { timeout: 5_000 });
  await page.screenshot({ path: `${shotsDir}/06-narrow-toolbar.png`, clip: await chartFrame.boundingBox() ?? undefined });
});

test('G0: linked selection across map and table, selected row highlighted', async ({ page }) => {
  test.setTimeout(120_000);
  await openDemo(page);

  const table = page.getByRole('table');
  const topRow = table.locator('tbody tr').first();
  await topRow.click();
  await expect(topRow).toHaveAttribute('aria-selected', 'true');

  await page.setViewportSize({ height: 1400, width: 1280 });
  const surface = page.locator('[aria-label^="Generated UI,"]').last();
  await surface.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${shotsDir}/07-linked-selection.png` });
});
