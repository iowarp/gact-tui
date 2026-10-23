import { expect, test } from '@playwright/test';

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
    await page.getByRole('button', { name: 'Open workspace canvas', exact: true }).click();
    await page.getByRole('button', { name: 'Open a canvas tab', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Session artifacts', exact: true }).click();
    const canvas = page.getByRole('complementary', { name: 'Workspace canvas' });
    await canvas.getByRole('button', { name: 'Open earthquakes.csv', exact: true }).click();
    const viewer = canvas.locator('[data-slot="file-viewer"]');
    const toolbar = viewer.locator('[data-slot="viewer-toolbar"]');
    await expect(viewer.getByRole('table')).toBeVisible();
    await expect(toolbar.getByRole('tab', { name: 'Preview', exact: true })).toContainText(
      'earthquakes.csv',
    );
    await expect(viewer.getByText('earthquakes.csv', { exact: true })).toHaveCount(1);
    await expect(viewer.getByText('CSV preview', { exact: true })).toHaveCount(0);
    await expect(viewer.getByText(/parsed rows/u)).toHaveCount(0);
    const geometry = await toolbar.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
    await viewer.getByRole('button', { name: 'Go to next page', exact: true }).click();
    await expect(viewer.getByText(/^11 - 20 of /u)).toBeVisible();
    for (const name of ['Versions', 'Lineage', 'Preview']) {
      const control = toolbar.getByRole('tab', { name, exact: true });
      await control.click();
      await expect(control).toHaveAttribute('aria-selected', 'true');
    }
    await expect(viewer.getByRole('table')).toBeVisible();
    const download = page.waitForEvent('download');
    await toolbar.getByRole('button', { name: 'Download file', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('earthquakes.csv');
    await page.screenshot({ path: testInfo.outputPath('csv-viewer.png') });
  });
}
