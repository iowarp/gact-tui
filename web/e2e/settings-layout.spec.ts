import { expect, test } from '@playwright/test';

const endpoint = `http://127.0.0.1:${process.env['CLIO_FIXTURE_PORT'] ?? '18799'}`;

test('appearance settings stay within narrow windows and apply the theme', async ({ page }) => {
  expect((await page.request.post(`${endpoint}/__test/reset`)).ok()).toBe(true);
  await page.addInitScript((connection) => {
    localStorage.setItem('clio.recent-connections', JSON.stringify([connection]));
  }, endpoint);
  await page.goto('/settings/appearance');
  await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page
      .locator('[data-slot="settings-control"]')
      .evaluateAll((controls) =>
        controls.map((control) => control.scrollWidth - control.clientWidth),
      );
    expect(overflow.length).toBeGreaterThan(0);
    for (const value of overflow) expect(value).toBeLessThanOrEqual(1);
    const pane = page.getByRole('region', { name: 'Settings content' });
    expect(
      await pane.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await expect(page.locator('html')).toHaveClass(/dark/);
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
    // Controlled service data exercises inheritance; writes are answered with the same defaults.
    let stored = { ...defaults, effort: null };
    await page.route('**/v1/session-defaults', (route) => {
      if (route.request().method() === 'PATCH')
        stored = { ...stored, ...(route.request().postDataJSON() as object) };
      return route.fulfill({ json: stored });
    });
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
    for (const width of [1280, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/settings/general');
      await expect(
        page.getByRole('spinbutton', { name: 'Transcript preview lines' }),
      ).toBeVisible();

      await page.goto('/settings/session-defaults');
      const panel = page.locator('[data-slot="session-defaults-panel"]');
      const model = page.getByRole('button', { name: 'Change default model' });
      await expect(model).toHaveText(/Codex \/ gpt-5\.6-luna/);
      await expect(page.getByRole('combobox', { name: 'Reasoning effort' })).toHaveText(
        'Default (Medium)',
      );
      await expect(panel.getByText('Models default', { exact: true })).toHaveCount(0);
      await expect(panel.getByText(/^Model default/)).toHaveCount(0);
      for (const row of await panel.locator('[data-slot="settings-row"]').all())
        expect(await row.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await expect(model).toBeInViewport();
      // Choices apply at once: there is no per-section save button.
      await expect(page.getByRole('button', { name: 'Save defaults' })).toHaveCount(0);

      const before = writes.length;
      await model.click();
      const picker = page.getByRole('dialog', { name: 'Choose a model for new sessions' });
      await expect(picker.getByRole('button', { name: 'Hidden (0)' })).toBeVisible();
      await picker.getByPlaceholder('Search providers and models').fill('luna');
      await picker.getByText('gpt-5.6-luna', { exact: true }).click();
      await expect(picker).toHaveCount(0);
      const reset = page.getByRole('button', { name: 'Use model from Models settings' });
      await expect(reset).toBeVisible();
      await expect.poll(() => writes.length).toBeGreaterThan(before);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}-pinned.png`) });
      await reset.click();
      await expect(reset).toHaveCount(0);
      await expect(model).toHaveText(/Codex \/ gpt-5\.6-luna/);
      await page.screenshot({
        path: testInfo.outputPath(`${theme}-${width}-session-defaults.png`),
      });
      expect(
        await page
          .getByRole('region', { name: 'Settings content' })
          .evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
    }
    expect(writes.every((url) => url.includes('/v1/session-defaults'))).toBe(true);
    expect(errors).toEqual([]);
  });
}
