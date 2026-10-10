import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

async function expectImageAtTop(image: Locator): Promise<void> {
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const viewport = element.closest('[data-slot="image-viewport"]')!;
        return Math.round(
          element.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
        );
      }),
    )
    .toBe(16);
}
test.beforeEach(async ({ page }) => {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
});

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
  const toolbar = canvas.locator('[data-slot="viewer-toolbar"]');
  await expect(canvas.getByRole('img', { name: 'vertical-displacement.png' })).toBeVisible();
  await expectImageAtTop(canvas.getByRole('img', { name: 'vertical-displacement.png' }));
  const metrics = await toolbar.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(metrics.height).toBeLessThanOrEqual(40);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
  for (const name of ['Preview', 'Versions', 'Lineage']) {
    await expect(toolbar.getByRole('tab', { name, exact: true })).toBeVisible();
  }
  const zoom = canvas.getByRole('button', { name: 'Reset image zoom', exact: true });
  const before = await zoom.innerText();
  await toolbar.getByRole('button', { name: 'File actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Zoom in', exact: true }).click();
  await expect(zoom).not.toHaveText(before);
  const image = canvas.getByRole('img', { name: 'vertical-displacement.png', exact: true });
  await expectImageAtTop(image);
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
  const download = page.waitForEvent('download');
  await toolbar.getByRole('button', { name: 'Download file', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('vertical-displacement.png');
  await toolbar.getByRole('button', { name: 'File actions', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Copy to another workspace', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: testInfo.outputPath('shared-image-toolbar.png'), fullPage: true });
  await toolbar.getByRole('tab', { name: 'Versions', exact: true }).click();
  await expect(canvas.getByRole('tabpanel', { name: 'Versions', exact: true })).toBeVisible();
  await toolbar.getByRole('tab', { name: 'Lineage', exact: true }).click();
  await expect(canvas.getByRole('tabpanel', { name: 'Lineage', exact: true })).toBeVisible();
  await expect(
    canvas.getByRole('img', { name: 'Artifact lineage graph', exact: true }),
  ).toBeVisible();
  await expect(canvas.getByText('Research execution', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('artifact-lineage-only.png'), fullPage: true });
  await toolbar.getByRole('tab', { name: 'Preview', exact: true }).click();
  await expect(image).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('[data-slot="viewer-toolbar"]').analyze()).violations,
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
  for (const name of [
    'Zoom in',
    'Zoom out',
    'Fit image to view',
    'Download file',
    'View file fullscreen',
  ]) {
    await expect(canvas.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await canvas.getByRole('button', { name: 'Zoom in', exact: true }).focus();
  await expect(page.getByRole('tooltip', { name: 'Zoom in', exact: true })).toBeVisible();
  await canvas.getByRole('button', { name: 'View file fullscreen', exact: true }).click();
  await expect(
    canvas.getByRole('button', { name: 'Exit file fullscreen', exact: true }),
  ).toBeVisible();
  await expectImageAtTop(canvas.getByRole('img', { name: 'vertical-displacement.png' }));
  await canvas.getByRole('button', { name: 'File actions', exact: true }).click();
  const info = page.getByRole('menuitem', { name: 'File information', exact: true });
  await expect(info).toBeVisible();
  await info.click();
  await expect(page.getByRole('dialog')).toContainText('vertical-displacement.png');
  await page.screenshot({
    path: testInfo.outputPath('shared-file-information-fullscreen.png'),
    fullPage: true,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await canvas.getByRole('button', { name: 'Exit file fullscreen', exact: true }).click();
});

test('SVG previews stay at the top and horizontally centered through pane resizing and zoom', async ({
  page,
}, testInfo) => {
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
  await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Open a canvas tab', exact: true }).click();
  await page.getByRole('menuitem', { name: 'File explorer', exact: true }).click();
  await page.getByRole('treeitem', { name: 'figure.svg', exact: true }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  const image = canvas.getByRole('img', { name: 'figure.svg', exact: true });
  await expect(image).toBeVisible();
  for (const [label, width] of [
    ['narrow', 1280],
    ['wide', 1600],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expectImageAtTop(image);
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const viewport = element.closest('[data-slot="image-viewport"]')!;
          const bounds = element.getBoundingClientRect();
          return Math.round(
            bounds.left +
              bounds.width / 2 -
              viewport.getBoundingClientRect().left -
              viewport.clientWidth / 2,
          );
        }),
      )
      .toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`image-top-${label}-light.png`) });
  }
  await canvas.getByRole('button', { name: 'File actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Zoom in', exact: true }).click();
  await expectImageAtTop(image);
  await canvas.getByRole('button', { name: 'Reset image zoom', exact: true }).click();
  await expectImageAtTop(image);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expectImageAtTop(image);
  await page.screenshot({ path: testInfo.outputPath('image-top-wide-dark.png') });
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
  await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
  await page.getByRole('button', { name: 'Open a canvas tab', exact: true }).click();
  await page.getByRole('menuitem', { name: 'File explorer', exact: true }).click();
  await page.getByRole('treeitem', { name: 'run.h5', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Workspace file preview', exact: true });
  await expect(preview.locator('[data-slot="empty-title"]')).toHaveText('run.h5');
  await expect(preview.getByRole('button', { name: /Download/ })).toHaveCount(1);
  await expect(preview.locator('[data-slot="viewer-toolbar"]')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await preview.getByRole('button', { name: 'Download file', exact: true }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toBe('run.h5');
  expect(await readFile((await downloaded.path())!)).toEqual(bytes);
  await page.screenshot({ path: testInfo.outputPath('unsupported-file-shared-toolbar.png') });
});
