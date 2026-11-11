import { expect, test } from '@playwright/test';
import { downloadFromFrame, selectFileView } from './file-viewer-setup';
import { showWorkbenchList } from './workspace-setup';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

for (const width of [1280, 390]) {
  test(`CSV viewer has one identity and compact working view controls at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
    expect((await page.request.post(`${endpoint}/__test/a2ui-data-demo`)).ok()).toBe(true);
    await page.addInitScript((address) => {
      localStorage.setItem('clio.recent-connections', JSON.stringify([address]));
      localStorage.setItem('theme', 'light');
    }, endpoint);
    await page.goto('/workspaces/ws_flat_ndp/sessions/sess_flat_ndp');
    await expect(
      page.getByRole('heading', { name: 'EarthScope NDP evidence review' }),
    ).toBeVisible();
    await showWorkbenchList(page, 'Artifacts');
    const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
    await canvas.getByRole('button', { name: 'Open earthquakes.csv', exact: true }).click();
    const viewer = canvas.locator('[data-slot="file-viewer"]');
    const toolbar = viewer.locator('[data-slot="frame-bar"]');
    const grid = viewer.getByRole('grid', { name: 'earthquakes.csv' });
    await expect(grid).toBeVisible();
    await expect(toolbar).toContainText('earthquakes.csv');
    // A narrow frame bar folds the modes to one menu; the selection holds either way.
    await expect(
      toolbar.getByRole('tab', { name: 'Data', exact: true, includeHidden: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(viewer.getByText('earthquakes.csv', { exact: true })).toHaveCount(1);
    await expect(viewer.getByText('CSV preview', { exact: true })).toHaveCount(0);
    await expect(viewer.getByText(/parsed rows/u)).toHaveCount(0);
    const geometry = await toolbar.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    // One continuous grid: no pagination, and scrolling reaches later rows.
    await expect(viewer.getByText(/Rows per page/u)).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Go to next page' })).toHaveCount(0);
    const rowCount = Number(await grid.getAttribute('aria-rowcount'));
    expect(rowCount).toBeGreaterThan(11);
    await grid.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(grid.locator(`[role="row"][aria-rowindex="${rowCount}"]`)).toBeVisible();
    for (const name of ['Source', 'Lineage', 'Data']) {
      await selectFileView(page, viewer, name);
    }
    await expect(grid).toBeVisible();
    expect((await downloadFromFrame(page, toolbar)).suggestedFilename()).toBe('earthquakes.csv');
    await page.screenshot({ path: testInfo.outputPath('csv-viewer.png') });
  });
}
