import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

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

for (const theme of ['dark', 'light'] as const) {
  test(`session defaults match Appearance in ${theme} without redundant model labels`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    const writes: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() === 'PATCH') {
        writes.push(request.url());
      }
    });
    expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
    const defaults = await (await page.request.get(`${endpoint}/v1/session-defaults`)).json();
    const configuration = await (await page.request.get(`${endpoint}/v1/providers/lm`)).json();
    // Controlled service data exercises inheritance without writing any defaults.
    await page.route('**/v1/session-defaults', (route) =>
      route.fulfill({ json: { ...defaults, effort: null } }),
    );
    await page.route('**/v1/providers/lm', (route) =>
      route.fulfill({ json: { ...configuration, provider_id: 'codex' } }),
    );
    await page.addInitScript(
      ({ endpoint, theme }) => {
        localStorage.setItem('clio.recent-connections', JSON.stringify([endpoint]));
        localStorage.setItem('theme', theme);
      },
      { endpoint, theme },
    );
    async function expectAlignedControls() {
      const controls = await page.locator('[data-slot="settings-control"]').all();
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        const edge = await control.evaluate((node) => {
          const outer = node.getBoundingClientRect();
          const inner = node.firstElementChild!.getBoundingClientRect();
          return {
            wide: node.parentElement!.getBoundingClientRect().width >= 672,
            rightGap: outer.right - inner.right,
            leftGap: inner.left - outer.left,
          };
        });
        expect(Math.abs(edge.wide ? edge.rightGap : edge.leftGap)).toBeLessThanOrEqual(1);
      }
    }

    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/settings/appearance');
      await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
      await expectAlignedControls();
      const appearance = await page.locator('[data-slot="settings-row"]').first().boundingBox();
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-appearance.png`) });

      await page.goto('/settings/general');
      await expect(
        page.getByRole('spinbutton', { name: 'Transcript preview lines' }),
      ).toBeVisible();
      await expectAlignedControls();
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-general.png`) });

      await page.goto('/settings/session-defaults');
      const panel = page.locator('[data-slot="session-defaults-panel"]');
      const model = page.getByRole('button', { name: 'Change default model' });
      await expect(model).toHaveText(/Codex \/ Luna/);
      await expect(page.getByRole('combobox', { name: 'Reasoning effort' })).toHaveText(
        'Default (Medium)',
      );
      await expect(panel.getByText('Models default', { exact: true })).toHaveCount(0);
      await expect(panel.getByText(/^Model default/)).toHaveCount(0);
      const rows = await panel.locator('[data-slot="settings-row"]').all();
      expect(rows).toHaveLength(5);
      const heights: number[] = [];
      for (const row of rows) {
        const bounds = await row.boundingBox();
        expect(Math.abs(bounds!.x - appearance!.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(bounds!.width - appearance!.width)).toBeLessThanOrEqual(1);
        heights.push(bounds!.height);
        expect(await row.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await row.evaluate((node) => getComputedStyle(node).borderBottomWidth)).toBe('1px');
      }
      await expectAlignedControls();
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
      await expect(model).toBeInViewport();
      const save = page.getByRole('button', { name: 'Save defaults' });
      await expect(save).toBeInViewport();
      expect(Math.abs((await save.boundingBox())!.x - appearance!.x)).toBeLessThanOrEqual(1);

      await model.click();
      const picker = page.getByRole('dialog', { name: 'Choose a model for new sessions' });
      await expect(picker.getByRole('button', { name: 'Hidden (0)' })).toBeVisible();
      await picker.getByPlaceholder('Search providers and models').fill('luna');
      await picker.getByText('gpt-5.6-luna', { exact: true }).click();
      await expect(picker).toHaveCount(0);
      const reset = page.getByRole('button', { name: 'Use model from Models settings' });
      await expect(reset).toBeVisible();
      const pinned = await model.boundingBox();
      const resetBounds = await reset.boundingBox();
      expect(
        Math.abs(pinned!.y + pinned!.height / 2 - resetBounds!.y - resetBounds!.height / 2),
      ).toBeLessThanOrEqual(1);
      expect(
        await panel
          .locator('[data-slot="settings-row"]')
          .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height)),
      ).toEqual(heights);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-pinned.png`) });
      await writeFile(
        testInfo.outputPath(`${theme}-${width}-geometry.json`),
        JSON.stringify(
          {
            appearance,
            rowHeights: heights,
            model: pinned,
            reset: resetBounds,
            save: await save.boundingBox(),
            writes,
          },
          null,
          2,
        ),
      );
      await reset.click();
      await expect(reset).toHaveCount(0);
      await expect(model).toHaveText(/Codex \/ Luna/);
      await page.getByRole('heading', { name: 'New session defaults' }).click();
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-session-defaults.png`),
      });
      expect(
        await page
          .getByRole('region', { name: 'Settings content' })
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
    }
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
