import { expect, test, type Page } from '@playwright/test';

// This spec's very first real test has, in this sandboxed environment, been
// observed taking well over two minutes to render the chart/map/table once
// (vega-embed, maplibre-gl, and the main bundle together run several
// megabytes) — every later test in the same run, including a full reload of
// the same page, is fast (a handful of seconds). That gap disappears once the
// files have been read once, which points at a cold OS/disk cache for this
// worktree rather than the app itself being slow, so a throwaway warm-up
// render before the timed tests pays that one-time cost outside any test's
// own budget instead of inside whichever test happens to run first.
test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(300_000);
  const page = await browser.newPage();
  try {
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
    page.setDefaultTimeout(240_000);
    // Best-effort: what matters is that the browser process has loaded these
    // chunks once, not that this particular attempt finishes cleanly. If the
    // cold cost is what the timed tests were hitting, paying it here (even
    // via a run that itself times out) still warms the same process for them.
    await openEarthquakeDemo(page).catch((error: unknown) => {
      console.log('Warm-up render did not finish (continuing regardless):', error);
    });
  } finally {
    await page.close();
  }
});

// Issue #1533 phase 3 (gact-tui): data by reference for map, table, workflow,
// code, mermaid, diff. This spec proves the marimo-style linked demo end to
// end in a real browser — a chart, a map, a data table, and a metric all
// reading one `dataUri` dataset (`web/e2e/a2ui-data-demo-fixture.mjs`),
// linked through one `selection` path, plus the data-table's own server-side
// paging, sorting, and per-column filtering over the whole referenced
// dataset (never a client-side cap).

const fixturePort = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
const fixtureEndpoint = `http://127.0.0.1:${fixturePort}`;
const workspaceUrl = '/workspaces/ws_flat_ndp/sessions/sess_flat_ndp';
const unexpectedErrors = new WeakMap<Page, string[]>();

// The map's basemap fetches real tiles from tile.openstreetmap.org
// (`scientific-map-view.tsx`'s `rasterStyle`); reaching the real service from
// a sandboxed/CI environment is flaky and rate-limited (the plain public
// tile server has no test SLA), which shows up as a blank white map in a
// screenshot even though nothing in the app is actually broken. Routed to a
// local fixture tile instead (#1533 item 6 — local tile routing for
// screenshots, the desktop-map-csp.spec.ts pattern from gact-tui #505), the
// map's own background is deterministic and instant in every test here.
// A light-gray 1x1 PNG, generated in code: the repo's media policy forbids committed
// test images, and any valid image lets MapLibre finish a tile.
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGN4+vTpfwAJEQOv/mB/yAAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ contentType: 'image/png', body: TILE_PNG });
  });
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
  await expect(page.getByText(/^Map background unavailable:/u)).toHaveCount(0);
});

/** Opens the workspace, publishes the linked earthquake surface, and waits for it to render. */
async function openEarthquakeDemo(page: Page) {
  // Publish before loading the page: the fixture serves the surface in its
  // session snapshot, not as a live event, so a page that loaded first never
  // sees it. (It used to work only because the flag leaked from an earlier
  // test across `/__test/reset`, which now clears it.)
  const published = await page.request.post(`${fixtureEndpoint}/__test/a2ui-data-demo`);
  expect(published.ok()).toBe(true);
  await page.goto(workspaceUrl);
  await expect(page.getByRole('heading', { name: 'EarthScope NDP evidence review' })).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();

  // Detached surface (no owning message): scroll the virtualized transcript
  // to its end so it mounts, same pattern as a2ui-smoke.spec.ts.
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation).toBeVisible();
  const surfaceSection = page.locator('[aria-label^="Interactive surface,"]');
  await expect
    .poll(
      async () => {
        await conversation.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
        return surfaceSection.count();
      },
      // The chart and map lazily load their own heavy chunks (vega-embed,
      // maplibre-gl) on first use; a genuinely cold browser process in this
      // environment has been observed taking minutes to finish that first
      // load (see the `beforeAll` warm-up above). This budget is generous
      // rather than tight — it costs nothing once warm, which every caller
      // after the warm-up is.
      { timeout: 240_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByText('Events reviewed')).toBeVisible({ timeout: 240_000 });
  await expect(page.getByRole('table')).toBeVisible({ timeout: 240_000 });
}

/**
 * The map's own side-list row button for one point — a plain, always-visible
 * DOM button (unlike the WebGL marker pin, which can be flaky to click in a
 * headless browser). Its accessible name is "{id} {category}"; matching the
 * id as a whole word at the start disambiguates it from the marker's own
 * "Select {id}" button.
 */
function mapPointButton(page: Page, id: string) {
  return page
    .locator('[data-slot="a2ui-map"]')
    .getByRole('button', { name: new RegExp(`^${id}\\b`, 'u') });
}

/**
 * The map's GeoJSON point layer — its declared data AND how many of its
 * points the WebGL canvas has ACTUALLY painted, past the virtualization
 * threshold (#1533 MEDIUM 6) where points draw as one maplibre circle layer
 * rather than 500 DOM markers. A "500 locations" header count only
 * proves the data resolved into React props; `renderedCount` (via the live
 * map's own `queryRenderedFeatures`) proves the canvas actually drew it —
 * exactly the coordinator's original ask (#1533 review), which caught TWO
 * real, stacked defects DOM-only assertions had both missed entirely:
 *
 * 1. The layer could silently never be (re-)created at all: `mapRef.current`
 *    stays null until react-map-gl's async `import('maplibre-gl')` resolves,
 *    so an effect gated on a one-shot dependency reading that ref had
 *    exactly one chance to catch the real instance. Fixed in
 *    `scientific-map-view.tsx` by tracking the instance via `onLoad` into
 *    React state instead.
 * 2. Even with the layer correctly declared, nothing ever painted: verified
 *    live (real, headed Microsoft Edge, no test-machine load) that
 *    `/assets/maplibre-gl-worker.mjs` — the worker maplibre-gl's GeoJSON
 *    tiling pipeline runs on — closed and errored moments after starting,
 *    because Vite never emitted it as a build output at all (nothing in our
 *    source statically references it; maplibre-gl constructs its URL as a
 *    runtime string relative to its own bundled chunk) nor its sibling
 *    `maplibre-gl-shared.mjs` the worker itself imports — `vite preview`'s
 *    SPA fallback served `index.html` for both requests instead, which the
 *    browser can't parse as a module. Every `postMessage` into that dead
 *    worker (including our circle layer's own data) was then a silent
 *    no-op: no error ever reached the main thread, `isSourceLoaded()` never
 *    turned true, and nothing painted — an entirely GeoJSON-only failure
 *    mode, invisible on any prior map here, since a raster-only style never
 *    depends on this worker being alive. Fixed in
 *    `vite-plugin-maplibre-worker.ts`, which serves both files itself
 *    (read live from the installed package, in dev and build).
 */
async function mapPointsLayerData(page: Page): Promise<{
  hasLayer: boolean;
  featureCount: number;
  highlightedCount: number;
  renderedCount: number;
  renderedHighlightedCount: number;
}> {
  return page.locator('[data-slot="a2ui-map-surface"]').evaluate(async (element) => {
    // `expect.poll` does not retry past a thrown exception (only past a
    // failed match), so a not-yet-exposed instance — genuinely possible on
    // an early poll, since the map mounts asynchronously — must be reported
    // as "not ready yet" (falsy/empty), not thrown, or the very first poll
    // tick fails the whole assertion instead of waiting out its timeout.
    const map = (element as unknown as { __clioMap?: import('maplibre-gl').Map }).__clioMap;
    const empty = {
      hasLayer: false,
      featureCount: 0,
      highlightedCount: 0,
      renderedCount: 0,
      renderedHighlightedCount: 0,
    };
    if (!map) return empty;
    const hasLayer = Boolean(map.getLayer('clio-map-points-circles'));
    const rendered = map.queryRenderedFeatures(undefined, { layers: ['clio-map-points-circles'] });
    const renderedCount = rendered.length;
    const renderedHighlightedCount = rendered.filter(
      (feature) => feature.properties?.['highlighted'] === true,
    ).length;
    const source = map.getSource('clio-map-points') as
      | import('maplibre-gl').GeoJSONSource
      | undefined;
    if (!source) return { ...empty, hasLayer, renderedCount, renderedHighlightedCount };
    const data = await source.getData();
    const features = 'features' in data ? data.features : [];
    return {
      hasLayer,
      featureCount: features.length,
      highlightedCount: features.filter((feature) => feature.properties?.['highlighted'] === true)
        .length,
      renderedCount,
      renderedHighlightedCount,
    };
  });
}

/** Open the map's optional list through its shared toolbar menu. */
async function showMapLocations(page: Page) {
  const map = page.locator('[data-slot="a2ui-map"]');
  const list = map.locator('[data-slot="a2ui-map-points-list"]');
  if (await list.isVisible()) return;
  await map.hover();
  await map.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Show locations list' }).click();
  await expect(list).toBeVisible();
}

/** Find a point by paging through the complete, bounded locations list. */
async function scrollToMapPointButton(page: Page, id: string) {
  await showMapLocations(page);
  const target = mapPointButton(page, id);
  const next = page.getByRole('button', { name: 'Next locations page' });
  while (!(await target.count()) && await next.isEnabled()) {
    const pagination = page.locator('[data-slot="a2ui-map-points-pagination"]');
    const before = await pagination.innerText();
    await next.click();
    await expect(pagination).not.toHaveText(before);
  }
  await expect(target).toBeVisible();
  return target;
}


for (const theme of ['light', 'dark'] as const) {
  test(`captures the linked demo in ${theme} theme`, async ({ page }) => {
    test.setTimeout(90_000);
    // A taller-than-default desktop viewport so the chart, map, and the start
    // of the table are visible together in one capture.
    await page.setViewportSize({ height: 1400, width: 1280 });
    await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await openEarthquakeDemo(page);
    // 500 points is past the map's own virtualization threshold (#1533
    // MEDIUM 6): they draw as one GeoJSON layer, not 500 DOM markers, so
    // "500 locations" (driven by the resolved point count itself, not a
    // rendering strategy) is what proves the whole referenced dataset loaded.
    await showMapLocations(page);
    await expect(page.getByText('500 locations')).toBeVisible({ timeout: 60_000 });
    // The DOM list proves the data resolved; this proves the map component
    // itself turned it into a real layer AND that the canvas actually
    // painted it (#1533 coordinator review — see `mapPointsLayerData`'s own
    // doc comment for the two stacked defects this caught).
    await expect
      .poll(async () => (await mapPointsLayerData(page)).hasLayer, { timeout: 20_000 })
      .toBe(true);
    await expect
      .poll(async () => (await mapPointsLayerData(page)).featureCount, { timeout: 20_000 })
      .toBe(500);
    await expect
      .poll(async () => (await mapPointsLayerData(page)).renderedCount, { timeout: 20_000 })
      .toBeGreaterThan(0);
    // The generated-UI surface lives inside the transcript's own scrolling
    // container, not the document, and is taller than even this viewport:
    // `fullPage` only extends to the document's height (capturing whatever
    // the last scroll left on screen), and an element screenshot of a
    // descendant of a custom scroll container measured far too tall here
    // (832x32491 — the container's own virtualized extent, not the
    // element's). Scrolling the surface's own top edge to the viewport's top
    // and taking a plain viewport screenshot sidesteps both.
    const surface = page.locator('[aria-label^="Interactive surface,"]').last();
    await surface.evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${test.info().outputDir}/earthquake-demo-${theme}.png` });
  });
}

test('a detached surface never overlaps the subagent card in the message before it', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);
  // The earthquake demo surface is "detached" (no owning message — the
  // fixture publishes it directly), rendered as a normal-flow sibling right
  // after the virtualized message list. A coordinator review found that
  // sibling overlapping the tail of the preceding message by ~53px in real
  // measurements: the virtualized container's declared height came from
  // `virtualizer.getTotalSize()`, a cached/estimated size that can
  // persistently undercount a row (here, a message expanded to show a
  // completed subagent card) with no further resize event ever correcting
  // it. `conversation.tsx` now independently measures the real DOM and pads
  // the gap; this proves it holds for the actual card+artifact+surface
  // sequence the bug was found in, not just in principle.
  const card = page.getByRole('article', { name: 'Child conversation unavailable for Station evidence specialist' });
  const surface = page.locator('[aria-label^="Interactive surface,"]').last();
  await surface.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  // Both rectangles must come from the same layout. Separate Playwright
  // roundtrips let transcript auto-scroll move the viewport between reads,
  // producing a fictitious overlap even though their relative gap is intact.
  const geometry = await card.evaluate((element) => {
    const frame = Array.from(
      document.querySelectorAll('[aria-label^="Interactive surface,"]'),
    ).at(-1);
    if (!frame) throw new Error('Detached interactive surface is missing');
    const cardRect = element.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      surfaceHeight: frameRect.height,
      gap: frameRect.top - cardRect.bottom,
    };
  });
  expect(geometry.cardHeight).toBeGreaterThan(0);
  expect(geometry.surfaceHeight).toBeGreaterThan(0);
  expect(geometry.gap).toBeGreaterThanOrEqual(0);
  // Re-screenshot the seam itself (#1533 coordinator review) — the numeric
  // gap above is the real proof, but a visual capture of the card sitting
  // just above the frame, with normal spacing between them, is what the
  // coordinator asked to see re-shot.
  await card.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const seamCardBox = await card.boundingBox();
  const seamSurfaceBox = await surface.boundingBox();
  if (seamCardBox && seamSurfaceBox) {
    await page.screenshot({
      path: `${test.info().outputDir}/card-surface-seam.png`,
    });
  }
});

test('renders a chart, map, table, and metric from one referenced dataset', async ({ page }) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);

  await expect(page.getByText('Events reviewed')).toBeVisible();
  await expect(page.getByText(/^500\s*events$/u)).toBeVisible();
  await expect(page.getByText('Depth vs. magnitude')).toBeVisible();
  await expect(page.getByText('Epicenters')).toBeVisible();

  // The map draws every referenced point, never a truncated inline subset
  // (the inline cap of 500 governs `points`, not a `dataUri` map). Past the
  // map's own virtualization threshold (#1533 MEDIUM 6), 500 points draw as
  // one GeoJSON layer rather than 500 DOM markers.
  await showMapLocations(page);
  await expect(page.getByText('500 locations')).toBeVisible();
  await expect
    .poll(async () => (await mapPointsLayerData(page)).hasLayer, { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => (await mapPointsLayerData(page)).featureCount, { timeout: 20_000 })
    .toBe(500);
  await expect
    .poll(async () => (await mapPointsLayerData(page)).renderedCount, { timeout: 20_000 })
    .toBeGreaterThan(0);

  // The table shows the agent's own base view (magnitude 2.0+), highest first.
  const table = page.getByRole('table');
  const firstDataRow = table.locator('tbody tr').first();
  await expect(firstDataRow).toContainText('eq0342');
});

test('selecting a map point highlights the matching table row', async ({ page }) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);

  await (await scrollToMapPointButton(page, 'eq0342')).click();
  await expect(mapPointButton(page, 'eq0342')).toHaveAttribute('aria-pressed', 'true');

  const table = page.getByRole('table');
  const matchingRow = table.locator('tr', { hasText: 'eq0342' });
  await expect(matchingRow).toHaveAttribute('aria-selected', 'true');
});

test('selecting a table row highlights the matching map point', async ({ page }) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);

  const table = page.getByRole('table');
  const topRow = table.locator('tbody tr').first();
  await expect(topRow).toContainText('eq0342');
  await topRow.click();

  await expect(topRow).toHaveAttribute('aria-selected', 'true');
  // Selecting via the table brings the shared selection to `eq0342`, but the
  // map's OWN virtualized list only mounts a row once it is scrolled into
  // view (#1533 MEDIUM 6) — the row isn't unmounted by being selected, it
  // just may never have rendered yet.
  await expect(await scrollToMapPointButton(page, 'eq0342')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('data-table pages through the whole referenced dataset, page size and last page included', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);
  const table = page.getByRole('table');

  // Default page size 10, 270 rows match magnitude >= 2.0: "1 - 10 of 270".
  await expect(page.getByText(/1 - 10 of 270/u)).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(10);

  // Change the page size to 100 rows.
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: '100', exact: true }).click();
  await expect(page.getByText(/1 - 100 of 270/u)).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(100);

  // Page to the very last page (6 pages of 50 after reverting, but at size
  // 100 there are 3 pages; jump there and confirm the tail, never truncated).
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.getByText(/201 - 270 of 270/u)).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(70);
});

// Both tests below open a `reui` DataGridColumnHeader dropdown (the filter
// and sort menu) on a server-driven (`manualPagination`/`manualSorting`/
// `manualFiltering`) table. That dropdown used to never stick open in a real
// browser: Radix's `onOpenChange` fired exactly once with `true`, the DOM
// never gained a `role="menu"` node, and no paired `onOpenChange(false)` ever
// fired — the state was not being toggled closed, the component holding it
// was being discarded and replaced with a fresh (default-closed) instance.
// Root cause: `flexRender` instantiates `column.columnDef.header` BY
// REFERENCE (`React.createElement(Comp, props)`), and this table's `header`
// was an inline arrow function recreated inside `ClioDataTable`'s `columns`
// useMemo. TanStack v9 rebuilds its table/column wrapper objects on every
// render (documented elsewhere in this codebase as a known source of exactly
// this class of staleness for sort/pin state), and on top of that the real
// A2UI/ARC/query-client stack re-renders for reasons unrelated to this table
// at all — every such rebuild handed `flexRender` a new function identity at
// the header's tree position, which React reads as a different component
// type and unmounts. Fixed in `data-table.tsx`: `header`/`cell` are now
// permanently stable module-scope function references
// (`ClioColumnHeaderCell`/`ClioColumnValueCell`) that read their per-column
// data off `columnDef.meta` instead of a closure, so column-def churn is an
// ordinary props update (preserving DropdownMenu open state) rather than a
// remount. Regression-tested directly in `data-table.test.tsx` (`keeps a
// column header dropdown open across a full columns-array rebuild`); the
// underlying request-building logic these menus drive (`mergeFilters`,
// `columnKindFromRows`, offset/sort request assembly) is unit-tested in
// `a2ui-data-table-source.test.tsx`.

test('a column filter narrows results while the agent base filter still applies', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);
  const table = page.getByRole('table');

  await expect(page.getByText(/1 - 10 of 270/u)).toBeVisible();

  // A real upward wheel scroll is what the app itself treats as the reader
  // taking over (`onWheel` -> `yieldUp` in `use-transcript-autoscroll.ts`),
  // which disengages the transcript's stick-to-bottom autoscroll before it
  // can fight Playwright's own scroll-into-view for the column header.
  await page.getByRole('log', { name: 'Conversation' }).hover();
  await page.mouse.wheel(0, -600);
  const placeHeader = page.getByRole('button', { name: 'place', exact: true });
  await placeHeader.scrollIntoViewIfNeeded();
  await expect(placeHeader).toBeInViewport();
  await placeHeader.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByLabel('Filter place, contains').fill('eastern');
  // Debounced (`SEARCH_DEBOUNCE_MS`), then a real network round trip: the
  // default 5s expect timeout is tight on this environment's documented cold
  // slowness (see the warm-up comment above `openEarthquakeDemo`).
  // 32 rows match; the default page shows the first 10 of them.
  await expect(page.getByText(/1 - 10 of 32/u)).toBeVisible({ timeout: 20_000 });

  // Close the dropdown before querying by role: Radix correctly marks the
  // rest of the page `aria-hidden` while its portal-rendered menu is open
  // (the filter text input lives inside that menu, so typing never auto-
  // closes it the way selecting a plain menu item does) — `getByRole`
  // deliberately excludes an `aria-hidden` subtree, so every role-based
  // locator below would resolve to nothing until the menu is dismissed.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Every visible row is Eastern Sierra, and still within the agent's own
  // magnitude >= 2.0 base filter (never dropped by the viewer's own filter).
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(10, { timeout: 20_000 });
  const placeCells = await rows.locator('td').allTextContents();
  expect(placeCells.some((text) => text.includes('Eastern Sierra'))).toBe(true);
  expect(placeCells.some((text) => /\b[01]\.\d\d\b/u.test(text))).toBe(false);
});

test('clicking a column header toggles its sort', async ({ page }) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);
  const table = page.getByRole('table');
  const firstRow = table.locator('tbody tr').first();
  await expect(firstRow).toContainText('eq0342');

  // See the filter test above: a real upward wheel scroll disengages the
  // transcript's stick-to-bottom autoscroll before it fights Playwright's
  // own scroll-into-view for the column header.
  await page.getByRole('log', { name: 'Conversation' }).hover();
  await page.mouse.wheel(0, -600);
  const depthHeader = page.getByRole('button', { name: 'depth', exact: true });
  await depthHeader.scrollIntoViewIfNeeded();
  await expect(depthHeader).toBeInViewport();
  await depthHeader.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Asc', exact: true }).click();

  await expect(firstRow).toContainText('eq0087');
});

// #1533 next slice (gact-tui, stacked on this branch): chart zoom/brush
// re-query, user filters on charts and maps, zone selection, and "Reference
// this". Screenshots for these land in a dedicated directory so they don't
// collide with the #508 demo captures above.
test('box selection links the map and explicit zoom preserves the full dataset', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);
  await showMapLocations(page);
  // Past the map's own virtualization threshold (#1533 MEDIUM 6), 500 points
  // draw as one GeoJSON layer rather than 500 DOM markers.
  await expect(page.getByText('500 locations')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await mapPointsLayerData(page)).hasLayer, { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => (await mapPointsLayerData(page)).featureCount, { timeout: 20_000 })
    .toBe(500);
  await expect
    .poll(async () => (await mapPointsLayerData(page)).renderedCount, { timeout: 20_000 })
    .toBeGreaterThan(0);

  const chartView = page.locator('[data-slot="a2ui-chart-view"]');
  const chart = page.locator('[data-slot="a2ui-chart"]');
  await chart.hover();
  await chart.getByRole('button', { name: 'Box select chart rows' }).click();
  // The demo surface is far taller than the viewport inside the transcript's
  // own scroll container, so the chart starts off-screen (a negative-y
  // bounding box) - `page.mouse` works in viewport coordinates, so the drag
  // below would silently land outside the page entirely without this.
  await chartView.scrollIntoViewIfNeeded();
  const box = await chartView.boundingBox();
  if (!box) throw new Error('the chart view has no bounding box');
  // Select a real rectangle, then zoom explicitly. Selection itself retains
  // the complete plotted dataset and only highlights matching map points.
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.75, { steps: 10 });
  await page.mouse.up();
  await expect(chart.getByRole('img', { name: /· 500 rows$/u })).toBeVisible();

  // The zone's own ids replaced the shared selection: the map (which always
  // shows every referenced point, never paginated) highlights a proper
  // subset - proof the brush actually re-queried and linked, not just
  // redrew the same 500 points. The side list virtualizes (#1533 MEDIUM 6),
  // so counting rendered `aria-pressed` buttons would only see whatever
  // happens to be scrolled into view; the header's own "N of 500 selected"
  // count (`a2ui-map.tsx`) is the always-visible, non-virtualized source of
  // truth for how many of the 500 are actually selected.
  const selectedCount = page.locator('[data-slot="a2ui-map"]').getByText(/of 500 selected$/u);
  await expect(selectedCount).toBeVisible({ timeout: 20_000 });
  const selectedText = (await selectedCount.textContent()) ?? '';
  const selected = Number.parseInt(selectedText, 10);
  expect(selected).toBeGreaterThan(0);
  expect(selected).toBeLessThan(500);
  // Not just listed as selected — the map's own layer data carries the
  // highlight flag for a real subset of points, AND the canvas actually
  // paints that subset differently (see `mapPointsLayerData`'s doc comment).
  await expect
    .poll(async () => (await mapPointsLayerData(page)).highlightedCount, { timeout: 20_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await mapPointsLayerData(page)).renderedHighlightedCount, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  await page.setViewportSize({ height: 1400, width: 1280 });
  const surface = page.locator('[aria-label^="Interactive surface,"]').last();
  await surface.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${test.info().outputDir}/chart-brush-zone-linked.png` });

  // Zoom is a separate action and never drops rows or clears the selection.
  const xDomain = () => chartView.evaluate((element) => {
    const chartState = (element as HTMLElement & {
      __clioChart?: { view: { scale: (name: string) => { domain: () => number[] } } };
    }).__clioChart;
    if (!chartState) throw new Error('Chart has not rendered');
    return chartState.view.scale('x').domain();
  });
  const beforeZoom = await xDomain();
  await chart.hover();
  await chart.getByRole('button', { name: 'Zoom to selection' }).click();
  await expect.poll(xDomain).not.toEqual(beforeZoom);
  await expect(chart.getByRole('img', { name: /· 500 rows$/u })).toBeVisible();
  await expect(selectedCount).toHaveText(selectedText);
  await chart.getByRole('button', { name: 'Reset zoom' }).click();
  await expect.poll(xDomain).toEqual(beforeZoom);
});

test('a chart filter popover narrows the plotted rows, layered on the agent base view', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);
  const chartFrame = page.locator('[data-slot="a2ui-chart"]');
  const chartImage = chartFrame.getByRole('img');
  await expect(chartImage).toHaveAttribute('aria-label', /· 500 rows$/u, { timeout: 20_000 });

  // The toolbar is revealed on hover (G0 redesign); a real mouse user reaches
  // it by moving across the card, so a synthetic click needs the same hover
  // first, or the (by-default pointer-events-none-until-hovered) button
  // never becomes a valid click target.
  await chartFrame.hover();
  await chartFrame.getByRole('button', { name: /^Filters/u }).click();
  await page.getByLabel('Filter place, contains').fill('eastern');

  await expect(chartImage).not.toHaveAttribute('aria-label', /· 500 rows$/u, { timeout: 20_000 });
  await expect(chartImage).toHaveAttribute('aria-label', /· [1-9]\d* rows$/u);

  await page.screenshot({
    path: `${test.info().outputDir}/chart-filter-popover.png`,
    clip: (await chartFrame.boundingBox()) ?? undefined,
  });
});

test('shift+dragging a rectangle on the map selects points and links the table', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);
  await showMapLocations(page);
  // Past the map's own virtualization threshold (#1533 MEDIUM 6), 500 points
  // draw as one GeoJSON layer rather than 500 DOM markers.
  await expect(page.getByText('500 locations')).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await mapPointsLayerData(page)).hasLayer, { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => (await mapPointsLayerData(page)).featureCount, { timeout: 20_000 })
    .toBe(500);
  await expect
    .poll(async () => (await mapPointsLayerData(page)).renderedCount, { timeout: 20_000 })
    .toBeGreaterThan(0);

  const mapSurface = page.locator('[data-slot="a2ui-map-surface"]');
  // See the same call in the chart brush test above: `page.mouse` needs
  // viewport coordinates, and the map starts off-screen in this tall,
  // virtualized-transcript surface.
  await mapSurface.scrollIntoViewIfNeeded();
  const box = await mapSurface.boundingBox();
  if (!box) throw new Error('the map surface has no bounding box');

  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up('Shift');

  // The composer can cover the drag endpoint. Pointer capture must still
  // complete the selection and clear the rectangle when released there.
  await expect(page.locator('[data-slot="a2ui-map-zone-drag"]')).toHaveCount(0);
  const selectedRows = page.getByRole('table').locator('tr[aria-selected="true"]');
  await expect.poll(async () => selectedRows.count(), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.screenshot({ path: `${test.info().outputDir}/completed-map-selection.png` });
});

test('"Reference this" puts a clean chip in the composer and a properly rendered quote once sent', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openEarthquakeDemo(page);
  await expect(page.getByRole('table')).toBeVisible();

  // The toolbar is revealed on hover (G0 redesign); hover the chart card
  // itself (its own first "Reference this" is the one under test) rather
  // than the button directly — a pointer-events-none-until-hovered element
  // can never itself become the target of a `.hover()`/`.click()` either.
  const chartFrame = page.locator('[data-slot="a2ui-chart"]');
  await chartFrame.hover();
  const referenceButtons = chartFrame.getByRole('button', { name: 'Reference this' });
  await expect(referenceButtons.first()).toBeVisible({ timeout: 20_000 });
  await referenceButtons.first().click();

  // The chip: a plain-language one-line summary, never the full markdown
  // block flattened onto one line (#1533 coordinator review). No zone is
  // selected on this chart, so it names the whole view.
  const attached = page.getByRole('list', { name: 'Attached selections' });
  await expect(attached).toBeVisible();
  await expect(attached).toContainText('the filtered current view (500 rows)');
  expect(await attached.innerText()).not.toContain('```json');
  expect(await attached.innerText()).not.toContain('**');
  expect((await attached.innerText()).includes('artifact_earthquake')).toBe(false);

  await page.screenshot({
    path: `${test.info().outputDir}/reference-this-composer.png`,
    clip: (await attached.boundingBox()) ?? undefined,
  });

  // Expand: the full machine-readable reference, properly rendered (a real
  // <table>, not a pipe-delimited line), not just present as text.
  await attached.getByRole('button', { name: /Show the full .* reference/u }).click();
  const popover = page.getByText('Sent with your next message, exactly as shown below.');
  await expect(popover).toBeVisible();
  const popoverBody = page.locator('[data-slot="popover-content"]');
  await expect(popoverBody.getByRole('table')).toBeVisible();
  await expect(popoverBody).toContainText('artifact_earthquake');
  await page.keyboard.press('Escape');

  // NOTE on the "sent" round trip (#1533 coordinator review item 2): this
  // suite's fixture server has no route for the composer's real
  // POST /v1/sessions/{id}/messages, so a live send-and-render check can't
  // be driven end to end here without building that fixture infrastructure.
  // That the reference's markdown "goes into the SENT message as a properly
  // rendered quote block" is instead proven at the unit level, on this exact
  // markdown string and the exact MarkdownText/Streamdown renderer the
  // transcript uses for every other message: `messageTextWithAnnotations`
  // (web/src/lib/composer-annotations.ts) wraps it as a '> ...' blockquote
  // ahead of the typed text (composer-annotations.test.ts), and
  // data-reference-this-button.test.tsx's "shows the plain summary on the
  // card, never the flattened full markdown block" test renders that same
  // markdown through MarkdownText and asserts a real <table> comes out.
  // Flagged explicitly rather than silently dropped.
});
