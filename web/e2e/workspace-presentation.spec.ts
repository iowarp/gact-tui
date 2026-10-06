import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;
test.beforeEach(async ({ page }) => {
  await page.request.post(`${endpoint}/__test/reset`);
  await page.addInitScript((value) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([value]));
    localStorage.setItem('theme', 'light');
  }, endpoint);
});

test('a narrow image pane keeps every action reachable in one bounded toolbar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
  await page.getByRole('button', { name: 'Open vertical-displacement.png', exact: true }).click();
  const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
  const toolbar = canvas.locator('[data-slot="viewer-toolbar"]');
  await expect(canvas.getByRole('img', { name: 'vertical-displacement.png' })).toBeVisible();
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
  await toolbar.getByRole('button', { name: 'Image actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Zoom in', exact: true }).click();
  await expect(zoom).not.toHaveText(before);
  await toolbar.getByRole('button', { name: 'Image actions', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download image', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('vertical-displacement.png');
  await toolbar.getByRole('tab', { name: 'Versions', exact: true }).click();
  await expect(canvas.getByRole('tabpanel', { name: 'Versions', exact: true })).toBeVisible();
  await toolbar.getByRole('tab', { name: 'Lineage', exact: true }).click();
  await expect(canvas.getByRole('tabpanel', { name: 'Lineage', exact: true })).toBeVisible();
  await toolbar.getByRole('tab', { name: 'Preview', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).include('[data-slot="viewer-toolbar"]').analyze()).violations,
  ).toEqual([]);
});

test('a wide viewer exposes labelled controls while the browser headers align', async ({
  page,
}) => {
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
    'Download image',
    'View image fullscreen',
  ]) {
    await expect(canvas.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await canvas.getByRole('button', { name: 'Zoom in', exact: true }).focus();
  await expect(page.getByRole('tooltip', { name: 'Zoom in', exact: true })).toBeVisible();
});
