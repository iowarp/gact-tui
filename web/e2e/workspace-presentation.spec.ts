import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { downloadFromFrame, selectFileView } from './file-viewer-setup';
import { showWorkbenchList } from './workspace-setup';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

// A fitted image sits centred in its viewport on both axes.
async function expectImageCentred(image: Locator): Promise<void> {
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const viewport = element.closest('[data-slot="image-viewport"]')!.getBoundingClientRect();
        const bounds = element.getBoundingClientRect();
        // Math.round(-0.4) is -0, which toBe(0) rejects; the sign of a centred offset is noise.
        return [
          Math.abs(Math.round(bounds.left + bounds.width / 2 - viewport.left - viewport.width / 2)),
          Math.abs(Math.round(bounds.top + bounds.height / 2 - viewport.top - viewport.height / 2)),
        ];
      }),
    )
    .toEqual([0, 0]);
}
async function imageWidth(image: Locator): Promise<number> {
  return image.evaluate((element) => element.getBoundingClientRect().width);
}
test.beforeEach(async ({ page }) => {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
});

for (const width of [1280, 1600]) {
  test(`an HTML file opens in the shared browser by its path at ${width}px`, async ({
    page,
  }, testInfo) => {
    const name = 'report.html';
    const html = '<h1>Fixture report</h1><script>window.__htmlPreviewRan = true;</script>';
    const opened: unknown[] = [];
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/v1/workspaces/ws_flat_ndp/files?*', (route) =>
      route.fulfill({
        json: { entries: [{ path: name, type: 'file', size: html.length }], truncated: false },
      }),
    );
    await page.route('**/v1/workspaces/ws_flat_ndp/files/read?*', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    await page.route('**/v1/sessions/sess_flat_ndp/browser/pages', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      opened.push(route.request().postDataJSON());
      return route.fulfill({
        status: 422,
        json: { detail: 'browser not available in the fixture' },
      });
    });
    await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
    await expect(page.getByRole('log', { name: 'Conversation', exact: true })).toBeVisible();
    await showWorkbenchList(page, 'Files');
    await page.getByRole('treeitem', { name, exact: true }).click();
    await expect.poll(() => opened).toEqual([{ path: name }]);
    const viewer = page
      .getByRole('complementary', { name: 'Workspace canvas' })
      .locator('[data-slot="file-viewer"]');
    await expect(viewer).toHaveCount(1);
    await expect(viewer.locator('iframe')).toHaveCount(0);
    await expect(
      viewer.getByRole('button', { name: 'Open in browser', exact: true }),
    ).toBeVisible();
    await expect(viewer.locator('[data-language="html"]')).toContainText(
      '__htmlPreviewRan = true;',
    );
    await page.screenshot({ path: testInfo.outputPath(`html-in-browser-${width}.png`) });
  });
}

test('a narrow image pane keeps every action reachable in one bounded toolbar', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/v1/artifacts/artifact_plot/lineage?*', (route) =>
    route.fulfill({
      json: {
        root: 'artifact_plot',
        direction: 'both',
        depth: 5,
        nodes: [
          { id: 'artifact_plot', type: 'artifact', name: 'vertical-displacement.png', version: 1 },
          { id: 'activity:plot', type: 'activity', tool: 'Render plot', status: 'ok' },
        ],
        edges: [
          { from: 'activity:plot', to: 'artifact_plot', type: 'generated', evidence: 'declared' },
        ],
      },
    }),
  );
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await page.getByRole('button', { name: 'Open vertical-displacement.png', exact: true }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  const toolbar = canvas.locator('[data-slot="frame-bar"]');
  await expect(canvas.getByRole('img', { name: 'vertical-displacement.png' })).toBeVisible();
  await expectImageCentred(canvas.getByRole('img', { name: 'vertical-displacement.png' }));
  const metrics = await toolbar.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.height).toBeLessThanOrEqual(40);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
  await expect(toolbar.getByRole('tab', { name: 'Preview', exact: true })).toBeVisible();
  await toolbar.getByRole('button', { name: 'File actions', exact: true }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Versions', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toolbar.getByRole('tab', { name: 'Lineage', exact: true })).toBeVisible();
  const image = canvas.getByRole('img', { name: 'vertical-displacement.png', exact: true });
  const before = await imageWidth(image);
  await toolbar.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => imageWidth(image)).toBeGreaterThan(before);
  const imageBefore = await image.boundingBox();
  expect(imageBefore).not.toBeNull();
  await page.mouse.move(imageBefore!.x + 20, imageBefore!.y + 20);
  await page.mouse.down();
  await page.mouse.move(imageBefore!.x + 60, imageBefore!.y + 65, { steps: 8 });
  await page.mouse.up();
  const imageAfter = await image.boundingBox();
  expect(imageAfter!.x).toBeCloseTo(imageBefore!.x, 1);
  expect(imageAfter!.y).toBeCloseTo(imageBefore!.y, 1);
  await expect(image).toHaveAttribute('draggable', 'false');
  expect((await downloadFromFrame(page, toolbar)).suggestedFilename()).toBe(
    'vertical-displacement.png',
  );
  await toolbar.getByRole('button', { name: 'File actions', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Copy to another workspace', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('shared-image-toolbar.png'), fullPage: true });
  await selectFileView(page, canvas.locator('[data-slot="file-viewer"]'), 'Versions');
  await expect(canvas.getByRole('tabpanel', { name: 'Versions', exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('[data-slot="frame-bar"]').analyze()).violations,
  ).toEqual([]);
  await selectFileView(page, canvas.locator('[data-slot="file-viewer"]'), 'Lineage');
  await expect(canvas.getByRole('tabpanel', { name: 'Lineage', exact: true })).toBeVisible();
  await expect(
    canvas.getByRole('region', { name: 'Artifact lineage graph', exact: true }),
  ).toBeVisible();
  await expect(canvas.getByText('Research execution', { exact: true })).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).include('[data-slot="frame-bar"]').analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('artifact-lineage-only.png'), fullPage: true });
  await selectFileView(page, canvas.locator('[data-slot="file-viewer"]'), 'Preview');
  await expect(image).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('[data-slot="frame-bar"]').analyze()).violations,
  ).toEqual([]);
});

test('a wide viewer exposes labelled controls while the browser headers align', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await page.getByRole('button', { name: 'Open vertical-displacement.png', exact: true }).click();
  const header = await page.locator('[data-slot="workspace-header"]').boundingBox();
  const canvasHeader = await page.locator('[data-slot="canvas-header"]').boundingBox();
  expect(header!.height).toBe(40);
  expect(canvasHeader!.height).toBe(40);
  expect(header!.y).toBe(canvasHeader!.y);
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  await canvas.getByRole('button', { name: 'Maximize canvas', exact: true }).click();
  for (const name of ['Zoom in', 'Zoom out', 'Open options', 'File actions']) {
    await expect(canvas.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await canvas.getByRole('button', { name: 'Zoom in', exact: true }).focus();
  await expect(page.getByRole('tooltip', { name: 'Zoom in', exact: true })).toBeVisible();
  await canvas.getByRole('button', { name: 'File actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'View file fullscreen', exact: true }).click();
  await expect
    .poll(() =>
      canvas
        .locator('[data-slot="file-viewer"]')
        .evaluate((node) => document.fullscreenElement === node),
    )
    .toBe(true);
  await expectImageCentred(canvas.getByRole('img', { name: 'vertical-displacement.png' }));
  await canvas.getByRole('button', { name: 'File actions', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Exit file fullscreen', exact: true }),
  ).toBeVisible();
  const info = page.getByRole('menuitem', { name: 'File information', exact: true });
  await expect(info).toBeVisible();
  await info.click();
  await expect(page.getByRole('dialog')).toContainText('vertical-displacement.png');
  await page.screenshot({
    path: testInfo.outputPath('shared-file-information-fullscreen.png'),
    fullPage: true,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await canvas.getByRole('button', { name: 'File actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Exit file fullscreen', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});

test('SVG previews stay centred through pane resizing and zoom', async ({ page }, testInfo) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#e1eee5"/><circle cx="120" cy="120" r="64" fill="#137a75"/></svg>';
  await page.route('**/v1/workspaces/ws_flat_ndp/files?*', (route) =>
    route.fulfill({
      json: { entries: [{ path: 'figure.svg', type: 'file', size: svg.length }], truncated: false },
    }),
  );
  await page.route('**/v1/workspaces/ws_flat_ndp/files/read?*', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: svg }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  // The loading shell has its own canvas toggle; wait for the conversation.
  await expect(page.getByRole('log', { name: 'Conversation', exact: true })).toBeVisible();
  await showWorkbenchList(page, 'Files');
  await page.getByRole('treeitem', { name: 'figure.svg', exact: true }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  const image = canvas.getByRole('img', { name: 'figure.svg', exact: true });
  await expect(image).toBeVisible();
  for (const [label, width] of [
    ['narrow', 1280],
    ['wide', 1600],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expectImageCentred(image);
    await page.screenshot({ path: testInfo.outputPath(`image-centred-${label}-light.png`) });
  }
  const fitted = await imageWidth(image);
  await canvas.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(() => imageWidth(image)).toBeGreaterThan(fitted);
  await canvas.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(() => imageWidth(image)).toBe(fitted);
  await expectImageCentred(image);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expectImageCentred(image);
  await page.screenshot({ path: testInfo.outputPath('image-centred-wide-dark.png') });
});

test('an unsupported workspace file uses one shared original download', async ({
  page,
}, testInfo) => {
  const bytes = Buffer.from([137, 72, 68, 70, 13, 10, 26, 10]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/v1/workspaces/ws_flat_ndp/files?*', (route) =>
    route.fulfill({
      json: { entries: [{ path: 'run.h5', type: 'file', size: bytes.length }], truncated: false },
    }),
  );
  await page.route('**/v1/workspaces/ws_flat_ndp/files/read?*', (route) =>
    route.fulfill({ contentType: 'application/octet-stream', body: bytes }),
  );
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  // The loading shell has its own canvas toggle; wait for the conversation.
  await expect(page.getByRole('log', { name: 'Conversation', exact: true })).toBeVisible();
  await showWorkbenchList(page, 'Files');
  await page.getByRole('treeitem', { name: 'run.h5', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Workspace file preview', exact: true });
  await expect(preview.getByLabel('Location', { exact: true })).toContainText('run.h5');
  await expect(preview.getByText('run.h5', { exact: true })).toHaveCount(1);
  const state = preview.locator('[data-slot="state-view"][data-kind="no-preview"]');
  await expect(state).toContainText('.h5');
  // The frame's Open menu holds the file's one download.
  await expect(state.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);
  await expect(preview.locator('[data-slot="frame-bar"]')).toHaveCount(1);
  const downloaded = await downloadFromFrame(page, preview);
  expect(downloaded.suggestedFilename()).toBe('run.h5');
  expect(await readFile((await downloaded.path())!)).toEqual(bytes);
  await page.screenshot({ path: testInfo.outputPath('unsupported-file-shared-toolbar.png') });
});
