import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('settings controls share a centre and remain within narrow windows', async ({ page }) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((connection) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([connection]));
  }, endpoint);
  await page.goto('/settings/appearance');
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await page.locator('[data-slot="settings-control"]').evaluateAll((controls) =>
      controls.map((control) => {
        const box = control.getBoundingClientRect();
        const input = control.querySelector('[role="radiogroup"], input, [role="switch"]');
        const inner = input?.getBoundingClientRect();
        const labels = input?.querySelectorAll('label');
        return {
          centre: box.x + box.width / 2,
          innerCentre: inner ? inner.x + inner.width / 2 : null,
          widths: labels ? [...labels].map((label) => label.getBoundingClientRect().width) : [],
          overflow: control.scrollWidth - control.clientWidth,
        };
      }),
    );
    expect(metrics).toHaveLength(3);
    for (const metric of metrics) {
      expect(metric.overflow).toBeLessThanOrEqual(1);
      expect(Math.abs(metric.centre - metrics[0]!.centre)).toBeLessThanOrEqual(1);
      if (metric.innerCentre !== null)
        expect(Math.abs(metric.innerCentre - metric.centre)).toBeLessThanOrEqual(1);
      if (metric.widths.length)
        expect(Math.max(...metric.widths) - Math.min(...metric.widths)).toBeLessThanOrEqual(1);
    }
    const pane = page.getByRole('region', { name: 'Settings content' });
    if (width === 768) {
      const description = page.getByText(
        'Use a focused reading column or give tables and diagrams more room.',
      );
      expect((await description.boundingBox())?.width).toBeGreaterThan(300);
    }
    expect(
      await pane.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const icons = await page
    .getByRole('radiogroup', { name: 'Theme' })
    .locator('svg')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
  expect(icons).toHaveLength(3);
  expect(Math.min(...icons)).toBeGreaterThanOrEqual(15);
});
